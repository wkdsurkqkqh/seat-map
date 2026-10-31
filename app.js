/* 좌석표 v6: 파일을 직접 열면 로컬 미리보기, 웹 주소에서는 Firebase 연동 */
(() => {
'use strict';
const admin = document.body.dataset.page === 'admin';
const $ = id => document.getElementById(id);
const initialSeats = () => Array.from({length:30}, (_,i) => ({id:i+1,row:Math.floor(i/10)+1,col:i%10+1}));
const initialLayout = () => ({seats:initialSeats(),nextId:31,history:[]});
const clone = value => JSON.parse(JSON.stringify(value));
const storageKey = 'misdirection-seatmap-5row-v6';
const localMode = location.protocol === 'file:' || new URLSearchParams(location.search).has('demo');
let mode='name', activeId=null, busy=false;
let state = {layout:initialLayout(),names:{},occupied:{}};
let backend=null;
let connected = false;

function seatsOf(layout) {
  // 이전 버전의 seatLayout/main 문서도 불러올 수 있게 유지.
  if (!Array.isArray(layout?.seats)) return initialSeats();
  const valid=[], ids=new Set(), cells=new Set();
  for (const s of layout.seats) {
    const id=Number(s.id), row=Number(s.row), col=Number(s.col), cell=`${row}:${col}`;
    if (!Number.isSafeInteger(id)||id<1||!Number.isInteger(row)||!Number.isInteger(col)||row<1||row>5||col<1||col>10||ids.has(id)||cells.has(cell)) continue;
    ids.add(id);cells.add(cell);valid.push({id,row,col});
  }
  return valid.sort((a,b)=>a.row-b.row||a.col-b.col);
}
function showStatus(s) { $('status').textContent=s; }
function inform(s) { if ($('message')) $('message').textContent=s; }
function positions(){ return seatsOf(state.layout); }
function rowColKey(row,col){return `${row}:${col}`;}
function nameOf(id){return (state.names[String(id)]||'').trim();}
function isUsed(id){return admin?Boolean(nameOf(id)):Boolean(state.occupied[String(id)]);}

function render() {
  const seats=positions(), index=new Map(seats.map((s,i)=>[rowColKey(s.row,s.col),{...s,number:i+1}]));
  const grid=$('grid');grid.replaceChildren();
  const fragment=document.createDocumentFragment();
  for (let row=1;row<=5;row++) for(let col=1;col<=10;col++) {
    const seat=index.get(rowColKey(row,col));
    const el=document.createElement(admin?'button':'div');
    if(admin)el.type='button';
    el.style.gridRow=String(row);el.style.gridColumn=String(col<=5?col:col+1);
    if(!seat){
      el.className='empty'+(admin&&mode==='layout'?' editable':'');
      if(admin){el.disabled=mode!=='layout'||busy;el.textContent=mode==='layout'?'+':'';el.setAttribute('aria-label',`${row}행 ${col}열 좌석 사용 가능으로 변경`);el.onclick=()=>toggleSeat(row,col);}
    }else{
      const used=isUsed(seat.id);
      el.className='seat'+(used?(admin?' admin-taken':' taken'):'');
      const num=document.createElement('span');num.className='small';num.textContent=`${seat.number}번`;
      const label=document.createElement('strong');
      label.textContent=admin?(nameOf(seat.id)||'빈 좌석'):(used?'사용 중':'빈 좌석');
      el.append(num,label);
      if(admin){
        el.disabled=busy;
        el.setAttribute('aria-label',`${seat.number}번 좌석 ${mode==='layout'?'사용 불가능으로 변경':'관객 이름 수정'}`);
        el.onclick=()=>mode==='layout'?toggleSeat(row,col):openNameDialog(seat);
      }
    }
    fragment.append(el);
  }
  const aisle=document.createElement('div');aisle.className='aisle';aisle.textContent='통로';aisle.style.gridRow='1 / 6';aisle.style.gridColumn='6';fragment.append(aisle);
  grid.append(fragment);
  const used=seats.filter(s=>isUsed(s.id)).length;
  $('stats').textContent=`사용 가능 ${seats.length}석 · 사용 중 ${used}석 · 빈 좌석 ${seats.length-used}석`;
  if(admin){
    // 주의: body[data-page]나 dialog는 절대로 편집 모드 버튼으로 취급하지 않음.
    document.querySelectorAll('#editor button[data-edit-mode]').forEach(btn=>{
      const selected=btn.dataset.editMode===mode;
      btn.classList.toggle('on',selected);
      btn.setAttribute('aria-pressed',String(selected));
    });
    $('undo').disabled=busy||!(Array.isArray(state.layout.history)&&state.layout.history.length);
  }
}
function openNameDialog(seat){
  if(busy)return;
  activeId=seat.id;
  $('seatTitle').textContent=`${seat.number}번 좌석`;
  $('guest').value=nameOf(seat.id);
  $('saveMessage').textContent='';
  $('nameDialog').showModal();
  $('guest').focus();
}
function setBusy(value){
  busy=value;
  if(admin){$('save').disabled=value;$('remove').disabled=value;$('cancel').disabled=value;render();}
}
async function saveName(name){
  if(activeId===null||busy)return;
  if(!backend){$('saveMessage').textContent='연결을 확인해 주세요.';return;}
  const id=activeId;
  $('saveMessage').textContent='저장 중…';setBusy(true);
  try{
    await backend.saveName(id,name);
    state.names[String(id)]=name;
    state.occupied[String(id)]=Boolean(name);
    $('nameDialog').close();activeId=null;
    inform(name?'관객 이름을 저장했습니다.':'관객 이름을 지웠습니다.');
  }catch(e){$('saveMessage').textContent='저장 실패: '+friendlyError(e);}
  finally{setBusy(false);}
}
async function toggleSeat(row,col){
  if(busy||!backend)return;
  const seat=positions().find(s=>s.row===row&&s.col===col);
  if(seat&&nameOf(seat.id)){
    inform('이름이 입력된 좌석입니다. 이름을 먼저 지운 뒤 좌석을 비활성화해 주세요.');return;
  }
  setBusy(true);
  try{
    await backend.toggleSeat(row,col);
    inform(`${row}행 ${col}열을 ${seat?'사용 불가능':'사용 가능'}으로 변경했습니다.`);
  }catch(e){inform('변경 실패: '+friendlyError(e));}
  finally{setBusy(false);}
}
async function undoLayout(){
  if(busy||!backend)return;
  setBusy(true);
  try{await backend.undo();inform('직전 좌석 배치를 되돌렸습니다.');}
  catch(e){inform('되돌리기 실패: '+friendlyError(e));}
  finally{setBusy(false);}
}
function friendlyError(e){
  if(e?.code==='permission-denied')return 'Firebase 권한이 없습니다. Firestore 규칙(Rules)을 확인하세요.';
  return e?.message||String(e);
}
function exportCsv(){
  const lines=[['좌석 번호','관객 이름','행','열'],...positions().map((s,i)=>[i+1,nameOf(s.id),s.row,s.col])];
  const csv='\ufeff'+lines.map(line=>line.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const link=document.createElement('a'),href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.href=href;link.download='좌석명단.csv';link.click();setTimeout(()=>URL.revokeObjectURL(href),3000);
}
function wireAdmin(){
  for(const btn of document.querySelectorAll('#editor button[data-edit-mode]')){
    btn.addEventListener('click',()=>{
      mode=btn.dataset.editMode;
      inform(mode==='layout'?'좌석 또는 빈칸의 +를 눌러 사용 가능 여부를 바꾸세요.':'좌석을 눌러 이름을 수정하세요.');
      render();
    });
  }
  $('undo').addEventListener('click',undoLayout);
  $('export').addEventListener('click',exportCsv);
  $('cancel').addEventListener('click',()=>{$('nameDialog').close();activeId=null;});
  $('nameDialog').addEventListener('close',()=>{activeId=null;});
  $('nameForm').addEventListener('submit',e=>{e.preventDefault();saveName($('guest').value.trim());});
  $('remove').addEventListener('click',()=>saveName(''));
}
function updateFromBackend(data){
  if(data.layout)state.layout=data.layout;
  if(data.names)state.names=data.names;
  if(data.occupied)state.occupied=data.occupied;
  render();
}
function localBackend(){
  const getStored=()=>{
    try{return JSON.parse(localStorage.getItem(storageKey)||'null');}catch(_){return null;}
  };
  let local=getStored()||clone(state);
  const commit=()=>{
    updateFromBackend(local);
    try{localStorage.setItem(storageKey,JSON.stringify(local));}catch(_){}
  };
  addEventListener('storage',e=>{if(e.key!==storageKey||!e.newValue)return;try{local=JSON.parse(e.newValue);updateFromBackend(local);}catch(_){}});
  commit();
  return {
    async saveName(id,name){
      if(name){local.names[String(id)]=name;local.occupied[String(id)]=true;}
      else{delete local.names[String(id)];delete local.occupied[String(id)];}
      commit();
    },
    async toggleSeat(row,col){
      const data=clone(local.layout),list=seatsOf(data),index=list.findIndex(s=>s.row===row&&s.col===col);
      if(index>=0){if(local.names[String(list[index].id)])throw new Error('이름을 먼저 지워야 합니다.');list.splice(index,1);}
      else{const next=Math.max(Number(data.nextId)||31,1+Math.max(0,...list.map(s=>s.id)));list.push({id:next,row,col});data.nextId=next+1;}
      data.history=(Array.isArray(data.history)?data.history:[]).slice(-19);
      data.history.push(seatsOf(local.layout));data.seats=list;
      local.layout=data;commit();
    },
    async undo(){
      const data=clone(local.layout),history=data.history||[];
      if(!history.length)throw new Error('되돌릴 배치가 없습니다.');
      data.seats=history.pop();data.history=history;local.layout=data;commit();
    }
  };
}
async function firebaseBackend(){
  const [{initializeApp},{getFirestore,doc,collection,onSnapshot,writeBatch,runTransaction}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js')
  ]);
  const db=getFirestore(initializeApp(window.firebaseConfig));
  const layoutRef=doc(db,'seatLayout','main');
  let hasLayout=false,hasNames=!admin,hasOccupied=admin,connectionError=false;
  const announce=()=>{if(!connectionError){connected=hasLayout&&hasNames&&hasOccupied;if(connected)showStatus('실시간 연결됨');}};
  const fail=(label,e)=>{connectionError=true;showStatus(`${label}: ${friendlyError(e)}`);inform(`${label}: ${friendlyError(e)}`);};
  onSnapshot(layoutRef,s=>{
    hasLayout=true;
    updateFromBackend({layout:s.exists()?s.data():initialLayout()});announce();
  },e=>fail('배치 조회 실패',e));
  if(admin){
    onSnapshot(collection(db,'seatNames'),snap=>{
      const names={};for(const d of snap.docs)if(typeof d.data().name==='string')names[d.id]=d.data().name;
      hasNames=true;updateFromBackend({names});announce();
    },e=>fail('이름 목록 조회 실패',e));
  }else{
    onSnapshot(collection(db,'seatStatus'),snap=>{
      const occupied={};for(const d of snap.docs)if(d.data().occupied===true||d.data().reserved===true)occupied[d.id]=true;
      hasOccupied=true;updateFromBackend({occupied});announce();
    },e=>fail('좌석 상태 조회 실패',e));
  }
  return {
    async saveName(id,name){
      const batch=writeBatch(db),nameRef=doc(db,'seatNames',String(id)),statusRef=doc(db,'seatStatus',String(id));
      if(name){batch.set(nameRef,{name});batch.set(statusRef,{occupied:true});}
      else{batch.delete(nameRef);batch.delete(statusRef);}
      await batch.commit();
    },
    async toggleSeat(row,col){
      await runTransaction(db,async tx=>{
        const snap=await tx.get(layoutRef),data=snap.exists()?snap.data():initialLayout();
        const list=seatsOf(data),idx=list.findIndex(s=>s.row===row&&s.col===col);
        if(idx>=0){
          const nameDoc=await tx.get(doc(db,'seatNames',String(list[idx].id)));
          if(nameDoc.exists()&&nameDoc.data().name)throw new Error('이름을 먼저 지워야 합니다.');
          list.splice(idx,1);
        }else{
          const id=Math.max(Number(data.nextId)||31,1+Math.max(0,...list.map(s=>s.id)));
          list.push({id,row,col});data.nextId=id+1;
        }
        const history=Array.isArray(data.history)?data.history.slice(-19):[];
        history.push(seatsOf(data));
        tx.set(layoutRef,{seats:list,history,nextId:Number(data.nextId)||31,updatedAt:Date.now()});
      });
    },
    async undo(){
      await runTransaction(db,async tx=>{
        const snap=await tx.get(layoutRef);
        if(!snap.exists())throw new Error('되돌릴 배치가 없습니다.');
        const data=snap.data(),history=Array.isArray(data.history)?data.history:[];
        if(!history.length)throw new Error('되돌릴 배치가 없습니다.');
        // 이름이 남아 있는 좌석을 제거하는 되돌리기는 차단합니다.
        const target=seatsOf({seats:history[history.length-1]});
        const targetIds=new Set(target.map(s=>s.id));
        const removed=seatsOf(data).filter(s=>!targetIds.has(s.id));
        for(const s of removed){
          const record=await tx.get(doc(db,'seatNames',String(s.id)));
          if(record.exists()&&record.data().name)throw new Error('이름이 입력된 좌석은 되돌리기로 제거할 수 없습니다.');
        }
        tx.set(layoutRef,{seats:target,history:history.slice(0,-1),nextId:Number(data.nextId)||31,updatedAt:Date.now()});
      });
    }
  };
}

if(admin)wireAdmin();
render();
(async()=>{
  if(localMode){
    backend=localBackend();connected=true;showStatus('로컬 테스트 · 온라인 동기화 없음');
    inform('테스트 모드입니다. 좌석 이름과 사용 가능 여부를 자유롭게 시험할 수 있습니다.');
    return;
  }
  try{
    if(!window.firebaseConfig?.projectId)throw new Error('config.js에 Firebase 설정이 없습니다.');
    backend=await firebaseBackend();
  }catch(e){showStatus('연결 실패: '+friendlyError(e));inform('Firebase 연결 오류가 발생했습니다. 파일을 직접 열거나 주소 끝에 ?demo=1을 붙이면 로컬로 시험할 수 있습니다.');}
})();
})();
