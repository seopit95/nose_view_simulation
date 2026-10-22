from pathlib import Path
from math import sin, cos, pi
from xml.sax.saxutils import escape
import json
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT=Path('/Users/kds_mac/Documents/Codex/2026-09-09/new-chat-2')
OUT=ROOT/'outputs/실시간_코성형_시뮬레이션_서비스_기획서.pdf'
for name,fn in [('KR','NanumGothic-Regular.ttf'),('KB','NanumGothic-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(ROOT/'work'/fn)))
pdfmetrics.registerFontFamily('KR',normal='KR',bold='KB',italic='KR',boldItalic='KB')
W,H=A4
M=42
CW=W-2*M
NAVY='#142F3B'; INK='#233F4B'; TEAL='#137E7A'; MINT='#E5F3EF'; BG='#F6F8FA'; LINE='#DCE4E8'; MUTED='#617581'; WHITE='#FFFFFF'; AMBER='#A56732'; SAND='#FBF0E5'
c=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
c.setTitle('실시간 코 성형 시뮬레이션 서비스 기획서 | NOSE VIEW')
c.setAuthor('Product Planning')
c.setSubject('Windows PC 기반 성형외과 상담용 실시간 시각화 서비스 제품 기획안')
PAGE=0
BOUNDS=[]

def co(v): return colors.HexColor(v)
def rect(x,y,w,h,fill=WHITE,stroke=None,r=0):
    c.setFillColor(co(fill))
    c.setStrokeColor(co(stroke or fill)); c.setLineWidth(.7)
    if r: c.roundRect(x,H-y-h,w,h,r,stroke=bool(stroke),fill=1)
    else: c.rect(x,H-y-h,w,h,stroke=bool(stroke),fill=1)
def line(x1,y1,x2,y2,color=LINE,width=1):
    c.setStrokeColor(co(color)); c.setLineWidth(width); c.line(x1,H-y1,x2,H-y2)
def para(text,x,y,w,size=10.6,leading=None,color=INK,bold=False,align=0):
    style=ParagraphStyle('p',fontName='KB' if bold else 'KR',fontSize=size,leading=leading or size*1.52,textColor=co(color),wordWrap='CJK',alignment=align,spaceAfter=0,allowWidows=0,allowOrphans=0)
    p=Paragraph(text,style)
    aw,ah=p.wrap(w,1000)
    p.drawOn(c,x,H-y-ah)
    BOUNDS.append((PAGE,round(x,1),round(y,1),round(w,1),round(ah,1),text[:70]))
    return y+ah

def small(text,x,y,w,color=MUTED): return para(text,x,y,w,8.6,12.8,color)
def label(text,x,y,color=TEAL,w=400): return para(text,x,y,w,9,12.5,color,True)
def title(text,y,size=16): return para(text,M,y,CW,size,size*1.35,NAVY,True)
def callout(y,head,body,fill=MINT,color=TEAL):
    ps=ParagraphStyle('m',fontName='KR',fontSize=10.4,leading=16,wordWrap='CJK')
    p=Paragraph(body,ps); _,ph=p.wrap(CW-34,1000)
    h=52+ph
    rect(M,y,CW,h,fill,r=9)
    para(head,M+17,y+14,CW-34,11.5,16,color,True)
    para(body,M+17,y+38,CW-34,10.4,16,INK)
    return y+h

def card(x,y,w,h,head,body,tag=None,fill=WHITE):
    rect(x,y,w,h,fill,LINE if fill==WHITE else None,r=8)
    yy=y+16
    if tag:
        label(tag,x+16,yy,w=w-32); yy+=22
    yy=para(head,x+16,yy,w-32,14,19,NAVY,True)+9
    yy=para(body,x+16,yy,w-32,10.2,15.7,INK)
    assert yy<=y+h-10,(PAGE,head,yy,y+h)

def table(y,headers,rows,widths,size=10.1):
    st=ParagraphStyle('cell',fontName='KR',fontSize=size,leading=size*1.5,textColor=co(INK),wordWrap='CJK')
    hs=ParagraphStyle('head',parent=st,fontName='KB',textColor=co(WHITE),fontSize=size)
    data=[[Paragraph(t.replace('\n','<br/>'),hs) for t in headers]]+[[Paragraph(t.replace('\n','<br/>'),st) for t in row] for row in rows]
    t=Table(data,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),co(NAVY)),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),
        ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[co(WHITE),co(BG)]),
        ('LINEBELOW',(0,1),(-1,-1),.55,co(LINE))]))
    _,h=t.wrap(CW,1000)
    t.drawOn(c,M,H-y-h)
    BOUNDS.append((PAGE,M,y,CW,h,'TABLE'))
    return y+h

def start(kicker,heading,sub=''):
    global PAGE
    PAGE+=1
    rect(0,0,W,H,WHITE)
    rect(0,0,9,H,TEAL)
    label('NOSE VIEW  /  PRODUCT PLAN',M,29,color=MUTED)
    para(f'{PAGE:02d}',W-M-28,27,28,11,15,TEAL,True,2)
    label(kicker,M,73)
    yy=para(heading,M,98,CW,25,33,NAVY,True)
    if sub: yy=para(sub,M,yy+11,CW,10.6,16.2,MUTED)
    c.bookmarkPage(f'p{PAGE}')
    c.addOutlineEntry(heading,f'p{PAGE}',level=0,closed=False)
    return yy+25

def finish(note=None):
    if note: small(note,M,755,CW)
    line(M,790,W-M,790)
    small('서비스 기획안 v1.0  |  2026.09.09',M,802,330)
    para(f'{PAGE:02d} / 14',W-M-65,802,65,8.6,12.8,MUTED,False,2)
    c.showPage()

def face(cx,cy,s=1,changed=False,mesh=False):
    # A deliberately schematic face, never a clinical simulation or patient photograph.
    c.saveState(); c.translate(cx,H-cy); c.scale(s,s)
    c.setStrokeColor(co('#AAC1C8'));c.setLineWidth(1.8)
    p=c.beginPath();p.moveTo(-44,46);p.curveTo(-63,15,-46,-67,0,-78);p.curveTo(46,-67,63,15,44,46);p.curveTo(32,78,-32,78,-44,46);c.drawPath(p)
    for sgn in [-1,1]:
        p=c.beginPath();p.moveTo(sgn*10,22);p.curveTo(sgn*20,29,sgn*30,27,sgn*36,23);c.drawPath(p)
        p=c.beginPath();p.moveTo(sgn*12,14);p.curveTo(sgn*20,8,sgn*29,8,sgn*34,14);c.drawPath(p)
    c.setStrokeColor(co(TEAL if changed else '#AAC1C8'));c.setLineWidth(2.1)
    nw=9 if changed else 14
    p=c.beginPath();p.moveTo(-5,14);p.curveTo(-6,-1,-nw,-15,-nw,-22);p.curveTo(-nw,-31,nw,-31,nw,-22);p.curveTo(nw,-15,6,-1,5,14);c.drawPath(p)
    c.setStrokeColor(co('#AAC1C8'));c.setLineWidth(1.7)
    p=c.beginPath();p.moveTo(-19,-46);p.curveTo(-6,-52,6,-52,19,-46);c.drawPath(p)
    if mesh:
        c.setFillColor(co(TEAL))
        for xx,yy in [(-5,12),(5,12),(-7,-5),(7,-5),(-nw,-23),(nw,-23),(0,-29),(0,-13)]: c.circle(xx,yy,2,fill=1,stroke=0)
    c.restoreState()

def arrow(x,y,w=22):
    line(x,y,x+w,y,TEAL,1.5);line(x+w-5,y-4,x+w,y,TEAL,1.5);line(x+w-5,y+4,x+w,y,TEAL,1.5)

# 01 COVER
PAGE=1
rect(0,0,W,H,BG)
rect(0,0,W,330,NAVY)
label('WINDOWS PC  /  CLINIC CONSULTATION',M,43,color='#A8D8CC')
para('실시간 코 성형\n시뮬레이션 서비스'.replace('\n','<br/>'),M,94,CW,32,45,WHITE,True)
para('환자가 자신의 얼굴로 변화를 미리 경험하는<br/>성형외과 상담용 프로그램 기획서',M,209,CW,13,21,'#D6E6E8')
label('NOSE VIEW · 가칭',M,293,color='#A8D8CC')
rect(M,360,CW,224,WHITE,LINE,r=14)
label('제품 경험 개념도',M+20,379)
small('화면 속 얼굴은 기능 설명을 위한 도식입니다.',M+196,380,285)
for xx,changed,lab in [(M+23,False,'현재 모습'),(M+271,True,'조절한 가상 모습')]:
    rect(xx,408,216,146,BG,r=8)
    face(xx+108,479,.61,changed,changed)
    para(lab,xx,535,216,9.4,13,TEAL if changed else MUTED,True,1)
arrow(M+242,480,19)
y=para('실시간 체험  ·  의료진 조절  ·  병원 내 영상 처리',M,620,CW,16,23,NAVY,True)
para('Windows PC와 보유 카메라를 활용하는 병원용 소프트웨어를 제안합니다.\n코 모양의 가상 변화를 보여주며, 실제 수술 결과의 일치 여부를 보장하지 않습니다.'.replace('\n','<br/>'),M,y+14,CW,11,18,INK)
small('기획 초안  |  2026.09.09  |  기능·일정·금액은 검증 전 제안값',M,747,CW)
c.bookmarkPage('p1');c.addOutlineEntry('실시간 코 성형 시뮬레이션 서비스','p1',level=0,closed=False)
finish()

# 02 STRATEGY
y=start('01  /  PRODUCT STRATEGY','무엇을 만들고, 누구에게 파는가','한 문장 정의: 의료진이 조절한 코의 가상 변화를 환자의 실시간 영상에 반영하는 B2B 상담 프로그램.')
w=(CW-24)/3
card(M,y,w,153,'환자','원하는 변화의 정도를 자신의 얼굴에서 비교하고, 의료진에게 선호를 구체적으로 전달합니다.','사용자 01')
card(M+w+12,y,w,153,'의료진·상담 직원','설명과 비교를 같은 화면에서 진행합니다. 조절 범위와 실현 가능성은 의료진이 판단합니다.','사용자 02')
card(M+2*(w+12),y,w,153,'병원 구매 담당자','상담 품질, 직원 사용성, 안정적인 설치·운영을 기준으로 도입 효과를 확인합니다.','구매자')
y+=178
y=table(y,['구분','확정된 요구 / 제안'],[
['사용자 제공 사항','성형외과에 판매할 프로그램 · 코 성형 상담 · 실시간 화면 · Windows PC · 카메라 보유'],
['권장 제품 범위','1개 상담실·1명 환자부터 시작. 병원 PC에서 영상을 처리하고 의료진이 코 모양을 조절.'],
['검증이 필요한 사항','카메라 모델·연결 방식, PC 사양, 판매 국가, 예산·일정, 파일 저장 정책, 의료기기 해당 여부.']
],[110,CW-110])
y=title('판매 차별점은 상담 현장에서 검증',y+23)
y=para('Crisalix와 Canfield VECTRA는 이미 얼굴·코 성형 시뮬레이션을 제공합니다. [1][2] 본 제품은 <b>기존 카메라 활용, 실시간 움직임, 한국어 상담 흐름, 로컬 처리</b>의 조합을 차별화 가설로 검증합니다. 경쟁 제품 대비 우월성이나 미지원 기능을 단정하지 않습니다.',M,y+10,CW,10.5,16)
small('읽는 순서  |  상담·기능 03-05쪽 → 구현·품질 06-08쪽 → 운영·사업 09-13쪽',M,y+15,CW)
finish('본 문서는 제품 설계 제안입니다. 국내 판매 관련 검토 항목은 한국 시장을 선택하는 경우 적용합니다.')

# 03 JOURNEY
y=start('02  /  CONSULTATION JOURNEY','환자는 보고, 의료진은 함께 조절한다','권장 운영: 1명씩 착석해 짧게 체험하고, 선호를 확인한 뒤 의료진 상담으로 연결합니다.')
steps=[
('01','설명·동의 확인','직원','상담용 가상 영상임을 설명하고, 영상 처리와 선택적 저장에 관한 안내·동의를 확인합니다.'),
('02','촬영 상태 맞추기','직원 + 환자','카메라 높이·거리·조명을 맞춥니다. 정면과 무표정에서 시작하고 인식 상태를 확인합니다.'),
('03','현재 모습 확인','환자','원본 화면을 먼저 보고 좌우 반전 여부를 확인합니다. 시스템은 기본 상태를 임시로 잡습니다.'),
('04','코 모양 조절·실시간 체험','의료진','콧대·코끝·코 폭의 표현을 조절합니다. 환자는 허용 범위 안에서 천천히 얼굴을 움직입니다.'),
('05','원본·대안 비교','의료진 + 환자','같은 시점의 원본과 가상 모습을 비교합니다. 세션 안에서 A/B/C 대안을 바꿔 선호를 확인합니다.'),
('06','의료진 설명·상담 종료','의료진 + 직원','가능 범위와 한계를 설명합니다. 별도 선택 시만 비교 이미지를 저장하고 다음 환자로 초기화합니다.')]
for n,head,who,body in steps:
    rect(M,y,38,36,MINT,r=7);para(n,M,y+7,38,15,20,TEAL,True,1)
    para(head,M+53,y,CW-175,12,17,NAVY,True)
    para(who,W-M-132,y,132,8.8,13,MUTED,False,2)
    yy=para(body,M+53,y+25,CW-53,10.4,16)
    y=yy+22
callout(y+1,'모드 이름으로 혼동을 줄입니다','화면에 <b>실시간 / 일시정지 / 저장 이미지</b> 상태를 항상 표시합니다. 일시정지한 모습이 현재 카메라 영상처럼 보이지 않게 합니다.')
finish()

# 04 MVP
y=start('03  /  MVP SCOPE','첫 판매 버전에 꼭 필요한 기능','MVP는 병원에서 반복 사용할 수 있는 최소 판매 버전입니다. 코 부위에 집중해 품질과 운영을 먼저 완성합니다.')
y=table(y,['우선순위','기능','첫 버전 범위'],[
['필수','카메라·얼굴 인식','장치 선택, 촬영 가이드, 단일 환자 세션, 인식 실패·다중 인물 감지 안내'],
['필수','실시간 코 모양 조절','콧대 윤곽, 코끝 표현, 코 폭의 상대 조절. 의학적 수술량과 연결하지 않음.'],
['필수','변형 품질 제어','코 이외 영역 보호, 흔들림 완화, 가림·과도한 회전 시 가상 효과 중지'],
['필수','비교·되돌리기','동시 원본/가상 비교, A/B/C 임시 대안, 한 단계 취소, 원본 복귀'],
['필수','선택적 상담 기록','동의·권한 확인 후 비교 이미지와 파라미터 저장. 가상 이미지 표시를 함께 포함.'],
['필수','병원 운영','직원 권한, 세션 초기화, 사용권 관리, 서명된 설치·업데이트, 장애 기록']
],[64,113,CW-177],size=10)
y+=23
w=(CW-14)/2
card(M,y,w,143,'후속 확장','정측면을 포함한 다각도 3D, 환자 재상담 이력, 병원 EMR 연동, 다지점 관리, 다국어 상담.',tag='V1.1 이후')
card(M+w+14,y,w,143,'초기 제품 범위에서 제외','수술법·보형물 자동 추천, 미용 점수, 실제 수술량(mm) 산출, 수술 후 결과 정확도 보장.',tag='별도 검증이 필요한 영역',fill=SAND)
finish('조절 슬라이더의 0은 원본입니다. 범위는 시각적 변화량이며 수술의 안전 범위나 물리적 길이를 의미하지 않습니다.')

# 05 UI
y=start('04  /  SCREEN CONCEPT','한 화면에서 보고, 조절하고, 비교','아래는 화면 구성 예시입니다. 얼굴 도식과 수치는 제품의 실제 영상 품질·성능을 나타내지 않습니다.')
uy=y
rect(M,uy,CW,352,NAVY,r=10)
label('NOSE VIEW',M+16,uy+15,color=WHITE,w=120)
label('실시간 · 인식 정상',M+187,uy+15,color='#9DDFCD',w=160)
small('세션 001',W-M-80,uy+15,68,color='#B7CED5')
vpw=165;gx=M+13
for i,cap in enumerate(['원본','가상 시뮬레이션']):
    xx=gx+i*(vpw+9)
    rect(xx,uy+47,vpw,205,'#F1F6F7',r=7)
    label(cap,xx+10,uy+59,w=145)
    face(xx+vpw/2,uy+153,.78,i==1,False)
    small('동일 시점의 영상',xx+14,uy+231,137)
px=M+366
label('코 모양 조절',px,uy+52,color=WHITE,w=130)
for i,(nm,v) in enumerate([('콧대 윤곽',.63),('코끝 표현',.54),('코 폭',.42)]):
    sy=uy+88+i*51
    small(nm,px,sy,120,color='#D9E8EA')
    line(px,sy+24,px+111,sy+24,'#617F8A',3)
    c.setFillColor(co('#98D9C9'));c.circle(px+111*v,H-(sy+24),4,fill=1,stroke=0)
small('상대 변화량\n의료진 조절'.replace('\n','<br/>'),px,uy+237,121,color='#B7CED5')
for i,(cap,fw) in enumerate([('대안 A',67),('대안 B',67),('대안 C',67),('원본 복귀',91)]):
    xx=M+13+[0,75,150,225][i]
    rect(xx,uy+267,fw,28,TEAL if i==0 else '#33515D',r=5)
    para(cap,xx,uy+274,fw,9.2,13,WHITE,True,1)
rect(px,uy+267,118,28,'#D4ECE5',r=5);para('일시정지',px,uy+274,118,9.2,13,TEAL,True,1)
small('가상 시뮬레이션입니다. 실제 수술 결과와 다를 수 있습니다.',M+15,uy+315,CW-30,color='#DCEBED')
y=uy+377
y=table(y,['화면 설계 원칙','동작'],[
['환자에게 중요한 정보','원본 / 가상 표시, 현재 모드, 촬영 자세 안내, 수술 결과와의 차이 안내를 지속 표시.'],
['직원 조작','실수 복구가 빠르도록 원본 복귀와 취소를 상시 노출. 저장 시 환자 세션·권한을 재확인.'],
['인식 불량','가상 코를 제거하고 원본 영상에 자세·조명 안내. 카메라 단절 시 영상 대신 연결 안내.']
],[133,CW-133],size=10.2)
finish('보조 모니터는 선택 사항입니다. 한 대의 모니터에서도 전체 화면 비교와 조절 패널 접기를 지원합니다.')

# 06 TECHNOLOGY
y=start('05  /  TECHNICAL APPROACH','실시간 얼굴 추적 + 국소 변형을 우선 검증','권장 방향: 얼굴의 위치·회전을 추정하고 코 주변의 영상과 표면을 제한적으로 변형합니다.')
y=table(y,['방식','장점','한계 / 적용 판단'],[
['2D·2.5D 국소 변형\n<b>초기 권장 후보</b>','기존 RGB 카메라 활용 가능성. 조절값을 실시간으로 반영하기에 유리.','큰 회전·가림·코의 입체 돌출 표현이 어려움. 정면 중심의 제한 범위를 먼저 실증.'],
['개인별 3D 재구성','다각도에서 일관된 형상을 표현할 가능성.','촬영·보정 절차와 개발 범위가 증가. 깊이·다중 촬영 정보 활용 여부 검증 후 확장.'],
['생성형 AI 영상 변환','정지 이미지에서 다양한 모습을 표현할 가능성.','영상 지연·깜박임·얼굴 정체성 변화·임의 형상 생성 위험. 초기 실시간 핵심 경로에서 제외.']
],[128,149,CW-277],size=10)
y=title('처리 흐름',y+24)
fy=y+17
names=[('입력 영상','색·해상도 정리'),('얼굴 추적','위치·회전 추정'),('코 국소 변형','주변 영역 보호'),('합성·표시','원본과 동시 비교')]
nw=(CW-45)/4
for i,(head,sub) in enumerate(names):
    xx=M+i*(nw+15)
    rect(xx,fy,nw,75,MINT,r=8)
    para(head,xx+9,fy+16,nw-18,11,16,TEAL,True,1)
    para(sub,xx+6,fy+43,nw-12,8.9,13,INK,False,1)
    if i<3: arrow(xx+nw+2,fy+37,11)
y=fy+96
y=para('MediaPipe Face Landmarker는 실시간 영상의 3D 얼굴 특징점과 변환 행렬을 제공하는 후보 기술입니다. [3] 이 결과만으로 정밀한 코 3D 모델이나 수술 결과를 얻는 것은 아닙니다. 코 변형·합성·시간적 안정화는 별도의 개발 과제입니다.',M,y,CW,10.5,16)
y=callout(y+21,'3~4주 기술 검증에서 결정할 것','보유 카메라로 코의 윤곽을 안정적으로 조절할 수 있는지, 고개를 돌릴 때 콧구멍·그림자·배경 경계가 깨지지 않는지 확인합니다. 통과하지 못하면 지원 각도를 줄이거나 3D 촬영 방식을 재검토합니다.')
finish('2.5D는 영상에 추정한 깊이·회전 정보를 일부 사용하는 접근입니다. 이 기획서에서는 정밀 3D 측정을 의미하지 않습니다.')

# 07 HARDWARE
y=start('06  /  WINDOWS & CAMERA','카메라가 있다는 것과 호환성은 별개다','새 카메라 구입을 전제로 하지 않습니다. 보유 장비의 영상 입력 방식과 실제 지연을 먼저 확인합니다.')
y=table(y,['항목','검증·설계 기준'],[
['Windows','신규 지원 기준은 지원 중인 Windows 11 64비트 버전을 제안. Windows 10 일반 지원은 2025.10.14 종료. [4]'],
['카메라','모델·렌즈·연결 방식·드라이버 확인. USB/UVC, HDMI 캡처, 제조사 SDK 방식에 따라 연동 범위가 달라짐.'],
['영상·PC','1080p/30fps 입력을 시험 시작점으로 사용. CPU·GPU·메모리·USB 대역폭을 측정하고 최소/권장 사양을 확정.'],
['촬영 환경','카메라를 눈높이 부근에 고정하고 균일한 조명·배경 구성. 거리·노출·초점은 장비별 가이드로 표준화.'],
['배포','Windows 설치형 앱 + 로컬 영상 엔진. 구현 스택은 팀 역량과 PoC 결과로 확정하고 모델·SDK 상업 이용 조건 검토.']
],[97,CW-97],size=10.3)
y=title('병원 PC 안에서 영상 처리',y+24)
y=para('카메라 → 메모리상의 영상 처리 → 환자 화면. 선택한 결과만 병원 저장소로 기록합니다. 라이선스·업데이트 통신은 별도 경로로 분리하며 환자 영상·얼굴 특징점은 전송하지 않는 구성을 제안합니다.',M,y+10,CW,10.5,16)
y=callout(y+23,'설치·장애 대응도 판매 기능입니다','장치 진단 화면, 연결 복구, 앱 재시작, 얼굴 영상 없는 오류 기록을 제공합니다. 서명된 업데이트와 이전 버전 복구를 준비하고, 상담 중에는 자동 업데이트를 실행하지 않습니다.')
finish('온라인 사용권 확인 방식과 오프라인 유예 기간은 계약 정책으로 확정합니다. 인터넷 장애로 상담이 갑자기 종료되지 않게 설계합니다.')

# 08 QUALITY
y=start('07  /  QUALITY & PILOT','성공 기준은 “예쁜 한 장”보다 반복 안정성','아래 수치는 개발·파일럿에서 검증할 제안 목표이며, 현재 제품의 측정 결과나 성능 보증이 아닙니다.')
y=table(y,['평가 항목','초기 목표','확인 방법'],[
['화면 반응','평균 표시 30fps 이상\n종단 지연 p95 120ms 이하','합의한 장비·1080p 입력에서 5분 측정. 카메라 입력부터 화면 출력까지 별도 계측.'],
['지원 자세','정면 중심 좌우 약 20°\n최종 범위는 PoC로 결정','느린 회전·정지·표정 변화 테스트. 허용 범위를 벗어나면 효과 중지 안내 확인.'],
['추적·복구','지원 조건의 평가 프레임 중\n유효 추적 95% 이상','고정된 테스트 영상과 실시간 세션으로 분모를 통일. 얼굴 재진입 후 1초 내 복구 목표.'],
['합성 품질','중대한 얼굴 왜곡 0건\n자연스러움 중앙값 4/5 이상','눈·입·배경 변형, 코 경계·콧구멍 깨짐 검토. 평가자·기준표를 사전에 고정.'],
['연속 운영','8시간 테스트 중 강제 종료 0건','세션 50회 전환, 카메라 재연결, 저장 실패, 오프라인·업데이트 복구를 함께 점검.'],
['정보 보호','세션 혼입·무단 저장·\n영상 외부 전송 0건','이전 환자 화면 잔존, 임시파일, 저장 권한, 로그, 네트워크 흐름을 확인.']
],[90,164,CW-254],size=9.8)
y=title('파일럿은 2~3개 병원에서',y+23)
y=para('성인 동의 참여자 30명 이상을 초기 사용성 검증 출발점으로 제안합니다. 피부톤·얼굴형·안경·조명·가림·카메라 조합을 나누어 실패율을 기록합니다. 이 규모로 임상적 정확도나 모든 환자군의 성능을 입증하지 않습니다.',M,y+10,CW,10.5,16)
small('통과 판단: 핵심 품질·개인정보 기준 충족 + 병원 직원의 독립 운영 가능 + 유료 도입 의사 확인. 실패 원인이 남으면 출시 범위·일정을 조정.',M,y+14,CW)
finish('p95는 측정값의 95%가 그 값 이하라는 뜻입니다. 최종 시험 조건·표본·통과 기준은 개발 계약 전에 고정합니다.')

# 09 MEDICAL
y=start('08  /  MEDICAL POSITIONING','사용목적부터 규제 범위를 확인한다','한국 판매를 선택할 경우의 검토 항목입니다. 해당 제품의 법적 분류와 필요한 절차는 아직 확인되지 않았습니다.')
y=callout(y,'제품의 사용목적을 먼저 고정합니다','제안 문구: “의료진과 환자가 코 외형의 가상 변화를 시각적으로 비교하며 상담하는 도구.” 진단, 수술량 산출, 수술법 추천, 치료 결과 예측 기능의 포함 여부를 명확히 구분합니다.')
y=title('환자가 혼동하지 않게 만드는 장치',y+24)
y=table(y+12,['지점','표시·운영 원칙'],[
['시작 화면·실시간 화면','“가상 시뮬레이션입니다. 실제 수술 결과와 다를 수 있습니다.”를 읽을 수 있는 크기로 지속 표시.'],
['의료진 설명','실현 가능성과 제한사항은 의료진이 설명. 화면상의 변화량을 보형물 높이·절제량 등과 자동 연결하지 않음.'],
['저장·출력','모든 가상 이미지에 시뮬레이션 표시, 세션·생성일·앱/모델 버전 포함. 수술 후 실제 사진으로 오인하지 않게 구분.'],
['외부 홍보','가상 이미지를 실제 치료 결과처럼 표현하지 않음. 병원의 공개 광고에는 의료광고 규정과 필요한 심의 여부 검토. [7]']
],[104,CW-104],size=10.1)
y=title('환자 파일럿·판매 전에 확인할 절차',y+23)
y=para('디지털의료제품 제도는 진단·치료·치료 예측 등 사용목적을 다룹니다. [5] 기능 설명서, 사용목적, 화면 예시, 광고 문구를 묶어 식약처 해당 여부·적용 법령 상담을 진행합니다. [6] 분류 결과에 따라 필요한 허가·신고·품질관리·시험 절차와 일정·예산을 추가합니다.',M,y+10,CW,10.5,16)
finish('이 페이지는 제품 기획 단계의 검토 목록이며 법적 분류 결론이 아닙니다. 면책 문구가 제품의 실제 기능·사용목적 검토를 대신하지 않습니다.')

# 10 PRIVACY
y=start('09  /  DATA & SECURITY','환자 영상의 기본값은 “실시간 처리만”','권장 정책: 원본 동영상은 녹화하지 않고, 환자별 선택 저장은 명시적으로 분리합니다.')
y=table(y,['데이터','기본 처리','통제'],[
['실시간 얼굴 영상·특징점','세션 중 메모리 처리\n상시 녹화·서버 전송 없음','캐시·덤프·오류 로그에 영상이 남지 않도록 검증. 동작 종료 시 임시 상태 해제.'],
['선택 저장 결과','동의와 직원 권한 확인 후\n병원 저장소에만 저장','이미지·조절값·버전·세션 ID를 연결. 파일명은 이름·연락처 대신 병원 내부 식별자 사용.'],
['운영 기록','영상 없는 오류·버전 기록\n조회·저장·반출 이력','권한 분리, 암호화·키 관리, 화면 잠금. 원격지원은 병원 승인 세션에서만 허용.']
],[98,169,CW-267],size=10.1)
y=title('도입 계약과 동의 화면에 정할 것',y+23)+12
items=[
('처리 근거','식별 가능한 얼굴 영상과 상담 정보의 수집 목적·항목·보유기간을 정합니다. 건강정보 등 민감정보는 별도 처리 근거를 확인합니다. [8]'),
('저장·파기','기본 미저장. 저장 선택 시 병원 보존 의무와 기록 편입 여부에 맞춰 보유기간·백업·파기 절차를 정합니다. 일률적 30일 보관 등을 임의 확정하지 않습니다.'),
('역할·반출','병원과 공급자의 개인정보 처리 역할, 위탁 여부, 유지보수 접근 범위를 계약에 명시합니다. 환자 전달·외부 반출은 권한과 수신자 확인 후 수행합니다.'),
('학습·클라우드','상담 데이터를 모델 학습에 자동 사용하지 않습니다. 학습·마케팅·클라우드·국외 이전을 추가할 때는 목적과 법적 근거를 별도로 검토합니다.')]
for head,body in items:
    label(head,M,y,w=93)
    yy=para(body,M+100,y,CW-100,10.1,15.7)
    y=yy+16
finish('안전조치 설계의 법적 근거: 개인정보 보호법 제29조. [8] 로컬 처리 역시 접근 통제·저장·반출 관리가 필요합니다.')

# 11 ROADMAP & COST
y=start('10  /  DELIVERY & BUDGET','기술 검증을 통과한 뒤 개발비를 확대한다','아래 일정·금액은 계획용 가정입니다. 보유 장비 호환성, 규제 검토, 개발팀 견적으로 다시 확정합니다.')
y=table(y,['단계','기간 / 투입','완료 산출물·판단'],[
['1. 기술 검증','3~4주 / 2~3인월','보유 장비 연동, 코 변형 데모, 지연·실패 분석, 지원 범위 결정. 실패 시 본개발 재산정.'],
['2. MVP 개발','7~8주 / 6~8인월','실시간 조절·비교·안내·선택 저장·권한·설치형 앱. 임상 자문으로 조절 UX 검토.'],
['3. 병원 파일럿','3~4주 / 2~3인월','규제·동의 조건 충족 후 2~3개 병원 운영 검증. 오류·이해도·유료 도입 의사 확인.'],
['4. 판매 준비','3~4주 / 2~3인월','오류 수정, 라이선스·업데이트·복구, 매뉴얼·직원 교육·지원 체계, 계약서.']
],[99,119,CW-218],size=9.9)
y=title('전체 16~20주 · 12~17인월 가정',y+21)
y=para('구성 예: 비전·그래픽 개발 1명, Windows 앱 개발 1명, PM/UX·QA의 단계별 참여, 성형외과 자문. 인월은 한 사람이 한 달간 투입되는 업무량입니다.',M,y+8,CW,10.1,15.5)
y+=16
w=(CW-14)/2
card(M,y,w,124,'기술 검증부터 발주','2~3인월 × 800~1,200만원<br/><b>1,600~3,600만원</b><br/>전체 개발비에 포함되는 단계입니다.',tag='1단계 예산 가정')
card(M+w+14,y,w,124,'전체 초기 개발','12~17인월 × 800~1,200만원<br/>+ 예비비 15%<br/><b>약 1.10억~2.35억원</b>',tag='전체 예산 가정',fill=MINT)
y+=141
small('산식: 9,600만~2억 400만원 × 1.15 = 1억 1,040만~2억 3,460만원. 인월 단가는 원가·간접비를 포함한 가정이며 조사된 시장 견적이 아닙니다.',M,y,CW)
finish('부가세·추가 장비·상용 SDK 사용료·인허가/임상시험·대규모 학습 데이터·출시 후 유지보수는 별도. 심사·데이터 확보 기간은 위 일정에 포함되지 않습니다.')

# 12 BUSINESS
y=start('11  /  BUSINESS MODEL','상담실 단위 구독 + 도입 서비스를 제안','아래 금액은 인터뷰와 파일럿에서 지불 의사를 확인하기 위한 가격 가설입니다. 확정 판매가·경쟁사 가격이 아닙니다.')
w=(CW-14)/2
card(M,y,w,159,'표준형 / 상담실 1개','Windows PC 1대 기준 사용권<br/>실시간 조절·비교·선택 저장<br/>업데이트·기본 원격 지원 포함<br/><b>월 39만원</b> 또는 연 429만원',tag='가격 실험안')
card(M+w+14,y,w,159,'초기 도입 / 병원별','장비 호환성 확인·설치<br/>촬영 환경 설정·직원 교육<br/>초기 운영 점검<br/><b>1회 150만원</b>',tag='도입 서비스',fill=MINT)
y+=182
y=table(y,['판매 단계','실행 내용 / 확인할 지표'],[
['문제 검증','원장·의료진·상담 직원 5~10명 인터뷰. 현재 상담 도구, 사용 빈도, 설치 제약, 불만, 예산 확인.'],
['현장 데모','보유 카메라 환경에서 원본→조절→비교→실패 복구까지 시연. 동의받은 참여자 또는 허가된 데모 자료 사용.'],
['파일럿→유료 계약','4주 운영 제안. 사용률, 직원 조작 시간, 환자 이해도, 장애 빈도, 월 구독 지불 의사로 판단.'],
['확장','검증된 병원의 추천·현장 교육 중심으로 확대. 다지점 관리·연동은 실제 구매 요구가 확인된 뒤 추가.']
],[105,CW-105],size=10)
y=title('병원 수익 효과는 측정할 가설',y+22)
y=para('상담 이해도 개선과 반복 사용을 우선 평가합니다. 수술 전환율은 가격·의료진·환자 구성의 영향이 크므로 보조 지표로만 관찰하고, 제품 효과로 단정하지 않습니다.',M,y+9,CW,10.4,16)
small('운영 손익 예시: 월 고정비 1,000만원, 병원당 변동비 5만원, 월 요금 39만원이면 월납 기준 약 30개 병원 필요. 초기 개발비 회수·연납 할인·부가세·별도 영업비는 제외한 단순 가정입니다.',M,y+16,CW)
finish('카메라·PC는 구독에 포함하지 않는 제안입니다. 출장 범위, 지원 시간, 추가 PC 요금, 해지·자료 반출 정책은 계약서에서 확정합니다.')

# 13 NEXT ACTIONS
y=start('12  /  NEXT DECISIONS','개발 착수 전에 확정할 다섯 가지','현재 확인되지 않은 항목을 추측으로 고정하지 않고, 기술 검증과 병원 인터뷰로 좁힙니다.')
y=table(y,['결정 항목','확인 내용','권장 담당'],[
['장비','카메라 모델·연결 방식·SDK 사용권, Windows 버전, CPU·GPU·메모리, 상담실 조명·모니터','제품 책임자 + 개발팀'],
['사용목적·판매국','상담용 시각화의 범위, 의료기기 해당 여부·적용 법령, 한국 외 판매 계획','제품 책임자 + 규제 자문'],
['초기 성능 범위','정면/좌우 회전 한계, 코 조절 항목, 영상 품질·지연 통과 기준','의료진 + 비전 개발자'],
['데이터·운영','저장 여부·보유기간, 병원 기록과의 관계, 직원 권한, 오프라인 사용권 정책','병원 + 제품 책임자'],
['사업 조건','PoC 예산, 전체 예산 상한, 희망 출시 시점, 파일럿 병원, 월 구독 지불 의사','사업 책임자']
],[105,290,CW-395],size=10)
y=title('첫 2주에 할 일',y+25)
y=para('<b>1.</b> 장비 목록과 샘플 입력을 확인하고, 원본 영상의 품질·지연을 측정합니다.<br/><b>2.</b> 의료진 인터뷰와 사용목적 정리를 병행해 조절 항목과 표시 문구를 확정합니다.<br/><b>3.</b> 개발팀에 동일한 기능 범위와 합격 기준을 전달해 PoC 견적을 받습니다.',M,y+11,CW,10.5,18)
y=callout(y+23,'초기 투자 의사결정','보유 장비에서 실시간 코 변형의 품질을 확인하고, 의료진이 상담에 쓸 만하다고 판단하며, 병원이 비용을 지불할 의사를 보이면 MVP 개발로 진행합니다. 규제·데이터 처리 조건은 환자 대상 운영 전에 해결합니다.')
finish('외주 계약 산출물 권장: 소스·빌드 절차, 모델/SDK 라이선스 목록, 설치본, 시험 보고서, 사용자 매뉴얼, 유지보수·하자 대응 범위.')

# 14 SOURCES
y=start('13  /  REFERENCES','근거 자료와 기획 가정을 구분했습니다','확인일: 2026.09.09  |  공식 기술 문서·제조사 자료·국내 법령/기관 안내를 참고했습니다.')
refs=[
('1','Crisalix · Face Simulator','얼굴 성형 시뮬레이션 제품의 존재와 상담 기능을 확인. 제조사의 효과 주장을 본 제품의 성과로 사용하지 않았습니다.','https://help.crisalix.com/en_US/latest-face-simulator'),
('2','Canfield · VECTRA H2 brochure','Face Sculptor의 코 성형 시뮬레이션과 상담 보조 목적 설명. 보유 카메라 연동이나 본 제품 성능의 근거는 아닙니다.','https://air.canfieldsci.com/common/docs/products/43/brochures/VECTRAH2Brochure.pdf'),
('3','Google · MediaPipe Face Landmarker','실시간 영상, 3D 얼굴 특징점, 변환 행렬 등 후보 기술의 기능 범위. 정밀 코 모델·수술 결과 예측을 보증하지 않습니다.','https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker'),
('4','Microsoft · Windows 10 end of support','Windows 10 일반 지원 종료일 확인. 본 제품의 Windows 11 지원은 제안이며 향후 호환성 시험이 필요합니다.','https://learn.microsoft.com/en-us/lifecycle/announcements/windows-10-end-of-support'),
('5','식약처 · 디지털의료제품 민원안내','디지털의료기기와 디지털의료·건강지원기기 등 제도 범위. 이 제품의 구체적인 해당 여부는 확정되지 않았습니다.','https://emedi.mfds.go.kr/msismext/emd/bif/digitInfoIntrcnView.do'),
('6','식약처 · 사전상담 사용자 매뉴얼','의료기기 해당 여부·적용 법령 등에 대한 사전상담 항목 확인. 실제 신청 자료·절차는 상담 시 재확인합니다.','https://data.mfds.go.kr/staticNew/preConsult/preConsult_manual_v2.0.pdf'),
('7','국가법령정보센터 · 의료법 제56조','2026.04.07 시행본의 거짓·과장 및 치료 효과 오인 우려 광고 등 금지 규정. 공개 활용 전 개별 광고 검토가 필요합니다.','https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0056&lsiSeq=285327&urlMode=lsScJoRltInfoR'),
('8','국가법령정보센터 · 개인정보 보호법','2025.10.02 시행본. 제15조·제21조·제23조·제26조·제28조의8·제29조 등 처리 근거·파기·민감정보·위탁·국외 이전·안전조치 검토.','https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=270351')]
for num,head,body,url in refs:
    label(num,M,y,w=24)
    link='<link href="'+escape(url,{'"':'&quot;'})+'" color="'+TEAL+'"><b>'+head+' ↗</b></link>'
    yy=para(link,M+27,y,CW-27,10.5,15.5)
    yy=para(body,M+27,yy+4,CW-27,9.5,14.5,MUTED)
    y=yy+17
small('성능 목표·기능 우선순위·화면·개발 일정·인월 단가·판매가·손익 수치는 이 문서의 기획 제안이며 외부 자료로 검증된 값이 아닙니다. 국내 규정은 한국 판매를 선택하는 경우의 검토 기준입니다.',M,y+1,CW)
finish('위 자료 제목을 누르면 원문으로 이동합니다. 제품 출시 시점에 법령·지원 버전·라이선스 조건을 다시 확인해야 합니다.')
assert PAGE==14,PAGE
c.save()
(ROOT/'work/layout_bounds.json').write_text(json.dumps(BOUNDS,ensure_ascii=False,indent=2))
print(OUT)
print('Pages:',PAGE)
for p,x,y,w,h,t in BOUNDS:
    if y>=70 and y<790 and y+h>785: print('LOW_CONTENT',p,y,h,t)
