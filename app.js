import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getFirestore,collection,doc,onSnapshot,writeBatch,runTransaction} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import {firebaseConfig} from './config.js';
const admin=document.body.dataset.mode==='admin';
const $=id=>document.getElementById(id);
const defaults=()=>Array.from({length:30},(_,i)=>({id:i+1,row:Math.floor(i/10)+1,col:i%10+1}));
let db,layout={seats:defaults()},names={},occupied=new Set(),mode='name',activeId=null,connected=false;
const layoutRef=()=>doc(db,'seatLayout','main');
const getSeats=data=>Array.isArray(data?.seats)?data.seats.filter(s=>Number.isInteger(s.row)&&Number.isInteger(s.col)&&s.row>=1&&s.row<=5&&s.col>=1&&s.col<=10):defaults();
const sorted=seats=>seats.slice().sort((a,b)=>a.row-b.row||a.col-b.col);
const say=text=>{if($('message'))$('message').textContent=text};
const status=text=>$('status').textContent=text;
const isOccupied=seat=>admin?!!names[seat.id]:occupied.has(seat.id);
function draw(){
 const seats=sorted(getSeats(layout)),grid=$('grid'),positions=new Map(seats.map(s=>[`${s.row},${s.col}`,s]));grid.replaceChildren();grid.style.setProperty('--rows',5);
 const numbers=new Map(seats.map((seat,index)=>[seat.id,index+1]));
 for(let r=1;r<=5;r++)for(let c=1;c<=10;c++){
  const seat=positions.get(`${r},${c}`),column=c<=5?c:c+1;
  if(!seat){if(!admin)continue;const b=document.createElement('button');b.type='button';b.className='empty'+(mode==='layout'?' editable':'');b.style.gridRow=r;b.style.gridColumn=column;b.disabled=mode!=='layout';b.title='사용 불가능 좌석 (클릭하여 활성화)';b.textContent=mode==='layout'?'+':'';b.onclick=()=>toggle(r,c,false);grid.append(b);continue}
  const button=document.createElement(admin?'button':'div');if(admin)button.type='button';button.className='seat'+(isOccupied(seat)?(admin?' admin-taken':' taken'):'');button.style.gridRow=r;button.style.gridColumn=column;
  const number=document.createElement('span');number.className='small';number.textContent=numbers.get(seat.id)+'번';const label=document.createElement('strong');label.textContent=admin?(names[seat.id]||'빈 좌석'):(isOccupied(seat)?'사용 중':'빈 좌석');button.append(number,label);
  if(admin)button.onclick=()=>{if(mode==='layout'){toggle(r,c,true);return}activeId=seat.id;$('seatTitle').textContent=`${numbers.get(seat.id)}번 좌석`;$('guest').value=names[seat.id]||'';$('saveMessage').textContent='';$('dialog').showModal();$('guest').focus()};
  grid.append(button)
 }
 const aisle=document.createElement('div');aisle.className='aisle';aisle.textContent='통로';aisle.style.gridRow='1 / 6';aisle.style.gridColumn=6;grid.append(aisle);
 const used=seats.filter(isOccupied).length;$('stats').textContent=`사용 가능 ${seats.length}석 · 사용 중 ${used}석 · 빈 좌석 ${seats.length-used}석`;
 if(admin){document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));$('undo').disabled=!(layout.history?.length)}
}
async function toggle(row,col,disable){
 if(!db){say('Firebase 연결을 확인하세요.');return}
 const current=getSeats(layout).find(s=>s.row===row&&s.col===col);
 if(disable&&current&&names[current.id]&&!confirm('관객 이름이 입력된 좌석입니다. 비활성화하면 화면에서 사라집니다. 계속할까요?'))return;
 try{await runTransaction(db,async tx=>{
  const snap=await tx.get(layoutRef()),data=snap.exists()?snap.data():{seats:defaults()};let seats=getSeats(data).map(s=>({...s}));const idx=seats.findIndex(s=>s.row===row&&s.col===col);
  if(idx>=0){if(!disable)throw Error('다른 사용자가 먼저 좌석을 활성화했습니다.');seats.splice(idx,1)}
  else{if(disable)throw Error('다른 사용자가 먼저 좌석을 비활성화했습니다.');const next=Math.max(Number(data.nextId)||31,1+Math.max(0,...seats.map(s=>Number(s.id)||0),...Object.keys(names).map(Number)));seats.push({id:next,row,col});data.nextId=next+1}
  const hist=Array.isArray(data.history)?data.history.slice(-19):[];hist.push(getSeats(data));tx.set(layoutRef(),{seats,history:hist,nextId:data.nextId||31,updatedAt:Date.now()});
 });say('좌석 배치를 저장했습니다. 다른 기기에도 반영됩니다.')}catch(e){say('배치 수정 실패: '+e.message)}
}
async function undo(){if(!db)return;try{await runTransaction(db,async tx=>{const snap=await tx.get(layoutRef());if(!snap.exists())throw Error('되돌릴 변경이 없습니다.');const d=snap.data(),h=d.history||[];if(!h.length)throw Error('되돌릴 변경이 없습니다.');tx.set(layoutRef(),{seats:h.at(-1),history:h.slice(0,-1),nextId:d.nextId||31,updatedAt:Date.now()})});say('직전 배치를 되돌렸습니다.')}catch(e){say('되돌리기 실패: '+e.message)}}
function exportCsv(){const rows=[['좌석 번호','관객 이름','행','열'],...sorted(getSeats(layout)).map((s,i)=>[i+1,names[s.id]||'',s.row,s.col])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='좌석명단.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function setup(){document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;say(mode==='layout'?'사용 가능한 좌석을 눌러 제거하거나 빈칸의 +를 눌러 활성화하세요.':'좌석을 눌러 이름을 수정하세요.');draw()});$('undo').onclick=undo;$('export').onclick=exportCsv;$('cancel').onclick=()=>$('dialog').close();
 async function save(name){if(activeId===null||!db)return;const id=activeId;$('saveMessage').textContent='저장 중…';$('save').disabled=$('remove').disabled=true;try{const b=writeBatch(db);if(name){b.set(doc(db,'seatNames',String(id)),{name});b.set(doc(db,'seatStatus',String(id)),{occupied:true})}else{b.delete(doc(db,'seatNames',String(id)));b.delete(doc(db,'seatStatus',String(id))}await b.commit();names[id]=name;draw();$('dialog').close();say('관객 이름 변경 완료')}catch(e){$('saveMessage').textContent='저장 실패: '+e.message}finally{$('save').disabled=$('remove').disabled=false}}
 $('save').onclick=()=>save($('guest').value.trim());$('remove').onclick=()=>save('');$('guest').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save($('guest').value.trim())}};
}
draw();if(admin)setup();
try{db=getFirestore(initializeApp(firebaseConfig));onSnapshot(layoutRef(),snap=>{layout=snap.exists()?snap.data():{seats:defaults()};draw();status('실시간 연결됨')},e=>status('배치 연결 실패: '+e.message));if(admin)onSnapshot(collection(db,'seatNames'),snap=>{names={};for(const s of snap.docs)if(s.data().name)names[Number(s.id)]=s.data().name;draw()},e=>status('명단 연결 실패: '+e.message));else onSnapshot(collection(db,'seatStatus'),snap=>{occupied=new Set(snap.docs.filter(s=>s.data().occupied===true||s.data().reserved===true).map(s=>Number(s.id)));draw()},e=>status('상태 연결 실패: '+e.message))}catch(e){status('연결 오류: '+e.message)}
