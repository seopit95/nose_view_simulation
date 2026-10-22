const { app, BrowserWindow, protocol, net, session, ipcMain, dialog, nativeImage, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { writeFile } = require('node:fs/promises');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);
app.setName('NoseView');
let window;
let saving = false;
const trusted = url => {
  try { const parsed = new URL(url); return parsed.protocol === 'app:' && parsed.hostname === 'noseview'; }
  catch { return false; }
};

app.whenReady().then(async () => {
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('app', request => {
    if (!trusted(request.url)) return new Response('Forbidden', { status: 403 });
    const url = new URL(request.url);
    let relative;
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; }
    catch { return new Response('Bad path', { status: 400 }); }
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).href);
  });
  // Covers Chromium requests, including those originating from the model Worker.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = trusted(details.url) || details.url.startsWith('file:') || details.url.startsWith('blob:') || details.url.startsWith('data:');
    callback({ cancel: !allowed });
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    return contents === window?.webContents && trusted(origin) && permission === 'media' && details.mediaType === 'video';
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const videoOnly = details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video';
    callback(contents === window?.webContents && trusted(details.requestingUrl) && permission === 'media' && videoOnly);
  });
  ipcMain.handle('noseview:save-png', async (event, dataUrl) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !trusted(event.senderFrame.url)) return { saved: false, error: '요청을 확인할 수 없습니다.' };
    if (saving) return { saved: false };
    if (typeof dataUrl !== 'string' || dataUrl.length > 24 * 1024 * 1024 || !dataUrl.startsWith('data:image/png;base64,')) return { saved: false, error: '저장할 이미지가 올바르지 않습니다.' };
    const bytes = Buffer.from(dataUrl.slice(22), 'base64');
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { saved: false, error: 'PNG 이미지가 아닙니다.' };
    const image = nativeImage.createFromBuffer(bytes), dimensions = image.getSize();
    if (image.isEmpty() || dimensions.width > 6000 || dimensions.height > 6000) return { saved: false, error: '이미지 크기를 확인해 주세요.' };
    saving = true;
    try {
      const result = await dialog.showSaveDialog(window, { title: '비교 이미지 저장',
        defaultPath: `NoseView-${new Date().toISOString().replaceAll(':', '-')}.png`,
        filters: [{ name: 'PNG 이미지', extensions: ['png'] }], properties: ['showOverwriteConfirmation'] });
      if (result.canceled || !result.filePath) return { saved: false };
      // Do not replace an existing patient image. The user can choose a new filename.
      await writeFile(result.filePath, image.toPNG(), { flag: 'wx', mode: 0o600 });
      return { saved: true };
    } catch (error) { return { saved: false, error: error.code === 'EEXIST' ? '같은 이름의 파일이 있습니다. 다른 이름으로 저장해 주세요.' : '파일을 저장하지 못했습니다. 저장 위치와 권한을 확인해 주세요.' }; }
    finally { saving = false; }
  });
  const createWindow = () => {
    window = new BrowserWindow({ width: 1440, height: 980, minWidth: 1100, minHeight: 810,
      title: 'NoseView · 코 윤곽 상담 시뮬레이터', backgroundColor: '#f5f6f3', show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
        sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.once('ready-to-show', () => window?.show());
    window.on('closed', () => { window = null; });
    void window.loadURL('app://noseview/');
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'darwin' ? [
    { label: 'NoseView', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '편집', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '보기', submenu: [{ role: 'togglefullscreen' }] },
  ] : [{ label: '파일', submenu: [{ role: 'quit' }] }, { label: '보기', submenu: [{ role: 'togglefullscreen' }] }]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
