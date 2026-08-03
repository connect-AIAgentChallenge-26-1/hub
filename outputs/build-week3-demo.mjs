import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "C:/Users/PC/hub/outputs/jigeum-review-week3-demo-2026-07-24.pptx";
const PREVIEW = "C:/Users/PC/AppData/Local/Temp/codex-presentations/manual-20260724/jigeum-review-week3/preview";
const HOME_DESKTOP = "C:/Users/PC/hub/outputs/presentation-assets/home-desktop.png";
const HOME_MOBILE = "C:/Users/PC/hub/outputs/presentation-assets/home-mobile.png";
const C = { bg:"#FAF9FE", white:"#FFFFFF", ink:"#1C1C1E", muted:"#6E6E73", line:"#E5E5EA", blue:"#007AFF", blueSoft:"#EAF3FF", green:"#03C75A", greenSoft:"#E9F9EF", navy:"#101727", orange:"#FF9F0A", red:"#FF453A", purple:"#5856D6" };
const FONT = "Malgun Gothic";

async function saveBlob(path, blob){ await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer())); }
function shape(slide, geometry, x,y,w,h, fill=C.white, line="none", radius="rounded-xl"){
  const options={geometry, position:{left:x,top:y,width:w,height:h}, fill, line:{style:"solid",fill:line,width:line==="none"?0:1}};
  if(radius!=="none" && ["rect","textbox","roundRect"].includes(geometry)) options.borderRadius=radius;
  return slide.shapes.add(options);
}
function textBox(slide, text, x,y,w,h, size=24, color=C.ink, bold=false, align="left"){
  const s=slide.shapes.add({geometry:"textbox",position:{left:x,top:y,width:w,height:h},fill:"none",line:{style:"solid",fill:"none",width:0}});
  s.text=text; s.text.style={fontFamily:FONT,fontSize:size,color,bold,alignment:align,verticalAlignment:"middle"}; return s;
}
function top(slide, section, n, dark=false){
  textBox(slide,section.toUpperCase(),64,26,420,24,13,dark?"#A9B5CD":C.muted,true);
  textBox(slide,String(n).padStart(2,"0"),1160,26,56,24,13,dark?"#A9B5CD":C.muted,true,"right");
}
function title(slide,t,sub,n,section="PROGRESS"){
  const size=t.length>34?32:t.length>27?34:38;
  top(slide,section,n); textBox(slide,t,64,72,1120,70,size,C.ink,true); if(sub) textBox(slide,sub,64,145,1120,40,18,C.muted,false);
}
function pill(slide,label,x,y,w,color=C.blue,soft=C.blueSoft){ shape(slide,"roundRect",x,y,w,34,soft,"none","rounded-full"); textBox(slide,label,x,y,w,34,14,color,true,"center"); }
function card(slide,x,y,w,h,accent=null){ const c=shape(slide,"roundRect",x,y,w,h,C.white,C.line,"rounded-2xl"); c.shadow="shadow-sm"; if(accent) shape(slide,"roundRect",x,y,8,h,accent,"none","rounded-full"); return c; }
function bullet(slide,txt,x,y,w,color=C.ink){ shape(slide,"ellipse",x,y+10,8,8,C.green,"none"); textBox(slide,txt,x+20,y,w-20,40,18,color,false); }
function arrow(slide,x,y,w,color=C.blue){ shape(slide,"rect",x,y+10,w-12,3,color,"none","none"); shape(slide,"triangle",x+w-15,y+3,15,17,color,"none","none"); }

const p=Presentation.create({slideSize:{width:1280,height:720}});

// 1. Cover
{
 const s=p.slides.add(); s.background.fill=C.navy; top(s,"AI AGENT CHALLENGE · WEEK 3",1,true);
 pill(s,"3주차 발표 · LIVE DEMO",64,112,220,C.green,"#173B2B");
 textBox(s,"지금리뷰",64,178,620,84,58,"#FFFFFF",true);
 textBox(s,"지도 검색에서 AI 리뷰 분석까지",64,268,760,58,32,"#E8ECF5",true);
 textBox(s,"처음의 문제 정의가 실제로 동작하는 모바일 MVP가 되기까지",64,346,700,42,19,"#A9B5CD");
 shape(s,"roundRect",850,126,322,450,"#18233B","#2C3A58","rounded-3xl");
 shape(s,"roundRect",886,169,250,58,"#FFFFFF","none","rounded-2xl"); textBox(s,"지금리뷰",908,178,180,38,24,C.blue,true,"center");
 shape(s,"roundRect",886,250,250,72,"#24314D","none","rounded-2xl"); textBox(s,"장소 검색",912,258,190,28,18,"#FFFFFF",true); textBox(s,"현재 지도 주변부터",912,286,190,23,14,"#A9B5CD");
 shape(s,"roundRect",886,342,250,72,"#24314D","none","rounded-2xl"); textBox(s,"리뷰 작성",912,350,190,28,18,"#FFFFFF",true); textBox(s,"로그인 후 작성",912,378,190,23,14,"#A9B5CD");
 shape(s,"roundRect",886,434,250,100,"#153C2A","none","rounded-2xl"); textBox(s,"AI 분석",912,442,190,28,18,C.green,true); textBox(s,"5단계 감정 분류\n막대그래프 반영",912,474,190,48,15,"#DDF8E7",true);
 textBox(s,"2026. 07. 24",64,642,250,24,14,"#7F8CA7",true);
}

// 2. Problem
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"리뷰는 많지만, 믿고 선택하기는 어렵다","지금리뷰는 ‘리뷰의 양’보다 방문 근거와 해석 가능성에 집중했다.",2,"PROBLEM");
 card(s,64,218,530,356,C.red); pill(s,"기존 경험",94,246,120,C.red,"#FFF0EF");
 textBox(s,"리뷰 신뢰의 기준이 모호하다",94,302,440,48,28,C.ink,true);
 bullet(s,"실제 방문 여부를 바로 판단하기 어렵다",94,376,440);
 bullet(s,"텍스트가 많아 전체 분위기를 빠르게 파악하기 어렵다",94,426,440);
 bullet(s,"처음 가는 동네일수록 선택 비용이 커진다",94,476,440);
 card(s,626,218,590,356,C.green); pill(s,"지금리뷰의 기준",656,246,160,C.green,C.greenSoft);
 textBox(s,"방문 근거 + 한눈에 보는 해석",656,302,500,48,28,C.ink,true);
 bullet(s,"영수증 인증 리뷰만 집계하는 구조",656,376,500);
 bullet(s,"리뷰 한 건을 5단계 감정으로 분류",656,426,500);
 bullet(s,"지도 탐색부터 업체 상세·리뷰까지 한 흐름",656,476,500);
}

// 3. Product flow
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"검색 → 업체 → 리뷰 → AI 요약을 한 흐름으로","사용자가 장소를 찾고 판단하는 순간에 필요한 정보만 이어 붙였다.",3,"PRODUCT");
 const items=[
  ["01","현재 지도에서 검색","현 위치·지도 영역을 우선"],
  ["02","업체 상세 확인","정보와 리뷰를 한 화면에"],
  ["03","로그인 후 리뷰 작성","비로그인은 검색 가능"],
  ["04","5단계 분석 반영","별점 없이 텍스트를 분류"]
 ];
 items.forEach((it,i)=>{ const x=64+i*292; card(s,x,244,252,274,i===3?C.green:C.blue); textBox(s,it[0],x+24,266,64,34,19,i===3?C.green:C.blue,true); textBox(s,it[1],x+24,326,204,60,24,C.ink,true); textBox(s,it[2],x+24,410,204,62,16,C.muted,false); if(i<3) arrow(s,x+252,360,40,C.blue); });
 pill(s,"핵심 가설",64,572,112,C.purple,"#EFEEFF"); textBox(s,"신뢰할 수 있는 입력과 쉬운 해석을 함께 제공하면, 장소 선택이 빨라진다.",194,568,980,42,21,C.ink,true);
}

// 4 Week 1
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"1주차에는 구현보다 기준을 먼저 세웠다","기능을 늘리기 전에 서비스가 지켜야 할 신뢰 규칙과 화면 원칙을 문서화했다.",4,"WEEK 1");
 const rows=[
  ["문제 정의","리뷰 신뢰 문제와 핵심 사용자 가치 정리"],
  ["도메인 규칙","영수증·결제일 30일·중복 방지·90일 가중치 설계"],
  ["개발 구조","React + Express + Supabase 구조 결정"],
  ["디자인 시스템","모바일 우선·지도 중심·초록=신뢰·파랑=행동"]
 ];
 rows.forEach((r,i)=>{ const y=220+i*88; card(s,64,y,1152,68,i===1?C.green:C.blue); pill(s,String(i+1).padStart(2,"0"),84,y+17,54,i===1?C.green:C.blue,i===1?C.greenSoft:C.blueSoft); textBox(s,r[0],160,y+13,210,42,20,C.ink,true); textBox(s,r[1],390,y+13,786,42,18,C.muted,false); });
 textBox(s,"결과",64,610,72,28,15,C.green,true); textBox(s,"이후 구현에서 무엇을 만들고, 무엇을 아직 완료라고 말하면 안 되는지 기준이 생겼다.",136,602,1050,42,20,C.ink,true);
}

// 5 Week 2
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"2주차에는 실제 지도를 서비스 흐름으로 연결했다","예시 데이터 화면을 걷어내고 실제 장소 검색과 상태 유지에 집중했다.",5,"WEEK 2");
 const cols=[
  ["지도·검색","Kakao Maps JS\nLocal REST API\n현재 지도 주변 우선 검색"],
  ["탐색 경험","자동완성\n검색 후 지도 위치 유지\n상세 → 지도 복귀 상태 유지"],
  ["사용자 흐름","Supabase 로그인\n비로그인 검색 허용\n리뷰 작성 시 로그인 요구"]
 ];
 cols.forEach((c,i)=>{ const x=64+i*384; card(s,x,230,352,310,i===0?C.green:C.blue); pill(s,`0${i+1}`,x+26,256,52,i===0?C.green:C.blue,i===0?C.greenSoft:C.blueSoft); textBox(s,c[0],x+26,312,300,42,25,C.ink,true); textBox(s,c[1],x+26,378,300,116,18,C.muted,false); });
 pill(s,"배운 점",64,585,106,C.orange,"#FFF5E5"); textBox(s,"지도 앱은 페이지 이동보다 ‘사용자가 보고 있던 맥락을 잃지 않는 것’이 더 중요했다.",188,578,1000,44,20,C.ink,true);
}

// 6 Week 3
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"3주차에는 데이터와 AI를 붙여 MVP를 증명했다","리뷰 텍스트가 실제 분석 결과와 그래프로 이어지는 최소 흐름을 완성했다.",6,"WEEK 3");
 const metrics=[["5","감정 단계"],["2","DB 마이그레이션"],["5","프론트 테스트"],["3","서버 테스트"]];
 metrics.forEach((m,i)=>{ const x=64+i*288; card(s,x,218,256,120,i===0?C.green:C.blue); textBox(s,m[0],x+22,230,84,58,38,i===0?C.green:C.blue,true); textBox(s,m[1],x+104,240,128,44,16,C.muted,true); });
 card(s,64,370,556,226,C.green); textBox(s,"데이터 기반",92,394,200,34,20,C.green,true); bullet(s,"profiles · places · receipts · reviews · likes",92,442,480); bullet(s,"Supabase Auth 세션과 마이페이지 흐름",92,492,480); bullet(s,"중복 영수증·인증 리뷰 검증용 DB 구조",92,542,480);
 card(s,648,370,568,226,C.blue); textBox(s,"AI 기반",676,394,200,34,20,C.blue,true); bullet(s,"OpenAI Responses API 서버 연동",676,442,492); bullet(s,"5단계 분류 + confidence + keywords",676,492,492); bullet(s,"테스트 리뷰를 즉시 그래프에 반영",676,542,492);
}

// 7 screenshots
{
 const s=p.slides.add(); s.background.fill=C.navy; top(s,"CURRENT PRODUCT",7,true); textBox(s,"PC와 모바일에서 같은 탐색 흐름이 동작한다",64,72,1120,62,38,"#FFFFFF",true); textBox(s,"지도 중심 구조는 유지하고, 화면 크기에 따라 사이드바와 하단 탐색으로 바뀐다.",64,142,1050,36,18,"#A9B5CD");
 const d=await fs.readFile(HOME_DESKTOP); s.images.add({blob:d,contentType:"image/png",alt:"지금리뷰 데스크톱 홈 화면",fit:"cover",position:{left:64,top:212,width:790,height:444},geometry:"roundRect",borderRadius:"rounded-2xl"});
 const m=await fs.readFile(HOME_MOBILE); s.images.add({blob:m,contentType:"image/png",alt:"지금리뷰 모바일 홈 화면",fit:"cover",position:{left:900,top:194,width:246,height:462},geometry:"roundRect",borderRadius:"rounded-3xl"});
 shape(s,"roundRect",880,184,286,482,"none","#31415F","rounded-3xl");
 pill(s,"실제 localhost 화면",672,610,164,C.green,"#173B2B");
}

// 8 architecture
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"프론트·API·데이터를 역할별로 분리했다","브라우저에는 공개 키만 두고, 외부 API와 비밀 키는 Express 서버가 담당한다.",8,"TECH STACK");
 const nodes=[
  {x:64,w:250,t:"React / CRA",d:"지도 UI · 라우팅 · 반응형\n로그인 상태 · 리뷰 화면",c:C.blue},
  {x:374,w:250,t:"Express API",d:"검색 프록시 · 입력 검증\nAI 요청 · 비밀 키 보호",c:C.purple},
  {x:684,w:250,t:"외부 API",d:"Kakao Maps / Local\nOpenAI Responses",c:C.green},
  {x:994,w:222,t:"Supabase",d:"Auth · Postgres\nRLS 기반 데이터",c:C.orange}
 ];
 // connectors first
 arrow(s,314,356,60,C.blue); arrow(s,624,356,60,C.purple); arrow(s,934,356,60,C.green);
 nodes.forEach(n=>{ card(s,n.x,256,n.w,214,n.c); pill(s,n.t,n.x+22,282,n.w-44,n.c,n.c===C.green?C.greenSoft:n.c===C.orange?"#FFF5E5":n.c===C.purple?"#EFEEFF":C.blueSoft); textBox(s,n.d,n.x+24,348,n.w-48,88,17,C.muted,false,"center"); });
 const tags=["React 19","Express 5","Supabase JS","OpenAI 6","Jest / node:test"];
 tags.forEach((t,i)=>pill(s,t,64+i*210,540,180,i===2?C.green:C.blue,i===2?C.greenSoft:C.blueSoft));
 textBox(s,"현재 지도는 Kakao API로 동작하며, 네이버지도는 비교·확장 후보로 유지하고 있다.",64,618,1100,30,15,C.muted,false);
}

// 9 AI flow
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"리뷰 한 건을 ‘별점’ 대신 5단계로 분류한다","자유로운 텍스트를 일관된 구조로 바꿔 전체 분위기를 막대그래프로 보여준다.",9,"AI WORKFLOW");
 const flow=["리뷰 입력","서버 검증","GPT-5.6 Luna","구조화 결과","그래프 반영"];
 flow.forEach((f,i)=>{ const x=64+i*226; if(i<4) arrow(s,x+184,278,42,C.blue); card(s,x,240,184,92,i===4?C.green:C.blue); textBox(s,f,x+12,258,160,52,18,C.ink,true,"center"); });
 textBox(s,"응답 스키마",64,374,170,30,16,C.muted,true);
 card(s,64,410,470,190,C.purple); textBox(s,'label: "positive"\nconfidence: 0.91\nkeywords: ["친절", "분위기"]',94,438,410,130,20,C.ink,true);
 const labels=[["매우 좋음",92,C.green],["좋음",76,"#34C759"],["보통",48,C.orange],["아쉬움",28,"#FF7A00"],["매우 아쉬움",14,C.red]];
 labels.forEach((a,i)=>{ const y=408+i*42; textBox(s,a[0],588,y,124,28,15,C.muted,true); shape(s,"roundRect",718,y+5,a[1]*4.2,18,a[2],"none","rounded-full"); });
 textBox(s,"분류 결과만 저장하는 것이 아니라 confidence와 키워드도 함께 받아 이후 설명 가능한 요약으로 확장할 수 있다.",64,636,1130,30,15,C.muted,false);
}

// 10 demo
{
 const s=p.slides.add(); s.background.fill=C.navy; top(s,"LIVE DEMO",10,true); textBox(s,"오늘 데모는 다섯 장면만 보여준다",64,72,1120,62,38,"#FFFFFF",true); textBox(s,"기능을 나열하기보다 한 사용자의 장소 선택 흐름을 그대로 따라간다.",64,142,1050,36,18,"#A9B5CD");
 const steps=[["1","홈","현재 위치와 검색창 초기화"],["2","검색","자동완성과 주변 우선 결과"],["3","상세","업체 탭에서 정보·리뷰 확인"],["4","작성","로그인 후 텍스트 리뷰 입력"],["5","분석","5단계 그래프와 마이페이지 확인"]];
 steps.forEach((a,i)=>{ const y=218+i*84; shape(s,"ellipse",64,y,48,48,i===4?C.green:C.blue,"none"); textBox(s,a[0],64,y,48,48,18,"#FFFFFF",true,"center"); textBox(s,a[1],138,y-2,130,34,21,"#FFFFFF",true); textBox(s,a[2],282,y-2,820,34,17,"#A9B5CD",false); if(i<4) shape(s,"rect",87,y+50,3,34,"#33415D","none"); });
 pill(s,"데모 주소  localhost:3000",880,622,292,C.green,"#173B2B");
}

// 11 next
{
 const s=p.slides.add(); s.background.fill=C.bg; title(s,"핵심 가설은 확인했고, 이제 ‘인증’을 실제 데이터로 닫는다","현재 데모 가능한 범위와 다음 구현 범위를 분명히 구분했다.",11,"STATUS & NEXT");
 card(s,64,220,548,350,C.green); pill(s,"지금 동작함",94,248,132,C.green,C.greenSoft); bullet(s,"실제 지도·장소 검색과 자동완성",94,310,470); bullet(s,"로그인·세션·마이페이지 화면",94,362,470); bullet(s,"텍스트 리뷰 AI 5단계 분석",94,414,470); bullet(s,"PC·모바일 반응형 UI",94,466,470); bullet(s,"프론트·서버 자동 테스트",94,518,470);
 card(s,640,220,576,350,C.blue); pill(s,"다음 구현",670,248,120,C.blue,C.blueSoft); bullet(s,"영수증 이미지 Supabase Storage 저장",670,310,500); bullet(s,"CLOVA OCR로 상호명·결제일 검증",670,362,500); bullet(s,"인증 통과 리뷰만 DB에 최종 저장",670,414,500); bullet(s,"이미지 해시·승인번호 중복 차단",670,466,500); bullet(s,"실데이터 집계·배포 환경 검증",670,518,500);
 textBox(s,"현재 AI 분석 데모는 개발 검증을 위해 영수증 인증을 우회한 테스트 리뷰를 사용한다.",64,616,1140,32,15,C.red,true);
}

// 12 close
{
 const s=p.slides.add(); s.background.fill=C.navy; top(s,"CLOSING",12,true); pill(s,"TAKEAWAY",64,126,114,C.green,"#173B2B");
 textBox(s,"지금리뷰는 리뷰의 양보다\n방문 근거와 해석을 먼저 보여준다",64,194,860,150,46,"#FFFFFF",true);
 textBox(s,"3주 동안 기획 문서에서 출발해 지도 탐색, 사용자 흐름, 데이터 구조, AI 분석까지 이어지는 MVP를 만들었다.",64,374,900,74,20,"#A9B5CD",false);
 card(s,64,508,1110,112,C.green); textBox(s,"피드백 받고 싶은 것",92,530,250,28,16,C.green,true); textBox(s,"① 5단계 표현이 직관적인가?   ② 인증 리뷰를 어디에서 가장 강조해야 하는가?   ③ 실제 사용 시 빠진 판단 정보는 무엇인가?",92,564,1030,34,18,C.ink,true);
 textBox(s,"감사합니다",1030,654,144,24,14,"#7F8CA7",true,"right");
}

await fs.mkdir(PREVIEW,{recursive:true}); await fs.mkdir("C:/Users/PC/hub/outputs",{recursive:true});
for(const [i,s] of p.slides.items.entries()){
 const stem=`slide-${String(i+1).padStart(2,"0")}`;
 await saveBlob(`${PREVIEW}/${stem}.png`,await p.export({slide:s,format:"png",scale:1}));
 await fs.writeFile(`${PREVIEW}/${stem}.layout.json`,await (await s.export({format:"layout"})).text(),"utf8");
}
await saveBlob(`${PREVIEW}/montage.webp`,await p.export({format:"webp",montage:true,scale:1}));
const inspect=await p.inspect({kind:"slide,textbox,shape,image",maxChars:50000}); await fs.writeFile(`${PREVIEW}/inspect.ndjson`,inspect.ndjson,"utf8");
const pptx=await PresentationFile.exportPptx(p); await pptx.save(OUT); process.stdout.write(OUT);
