// DATA
const SUPABASE_URL = 'https://hgwswhcbfwegoantrhqy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VUlRS97KudTUCEOo2HptRw_suOf3CbS';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let USERS = {};
let MEMBERS_LIST = [];
let events = [];
let infoItems = [];  // ข้อมูลอื่นๆ

let currentUser=null,nextId=20,editingId=null;
const TODAY=new Date();
let calYear=TODAY.getFullYear(),calMonth=TODAY.getMonth();
const THAI_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// AUTO-MARK PAST EVENTS AS DONE
async function autoMarkPastEventsDone() {
  const todayStr = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}-${String(TODAY.getDate()).padStart(2,'0')}`;
  const todayTime = TODAY.getHours() * 60 + TODAY.getMinutes();

  const toMark = events.filter(e => {
    if (e.status === 'done' || e.status === 'cancelled') return false;
    const eventDate = e.endDate || e.date; 
    if (eventDate < todayStr) return true;   
    if (eventDate === todayStr) {             
      const endT = e.endTime || e.time;
      if (!endT) return false;
      const [h,m] = endT.split(':').map(Number);
      return (h * 60 + m) < todayTime;       
    }
    return false;
  });

  if (!toMark.length) return;

  toMark.forEach(e => { e.status = 'done'; });

  await Promise.all(
    toMark.map(e =>
      supabaseClient.from('events').update({ status: 'done' }).eq('id', e.id)
    )
  );

  if (toMark.length > 0) {
    console.log(`✅ Auto-marked ${toMark.length} event(s) as done`);
  }
}

async function loadDataFromDB() {
  try {
    const { data: userData, error: userError } = await supabaseClient.from('users').select('*');
    if (userError) throw userError;

    if (userData) {
      USERS = {};
      userData.forEach(u => {
        USERS[u.username] = { pass: u.password, name: u.name, roleLabel: u.role_label, role: u.role, av: u.av, dept: u.dept };
      });
      MEMBERS_LIST = userData;
    }

    const { data: eventData, error: eventError } = await supabaseClient
      .from('events')
      .select(`*, event_signups(username, signed_at)`);
    if (eventError) throw eventError;

    if (eventData) {
      events = eventData.map(e => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        time: e.time ? e.time.substring(0,5) : '', 
        endDate: e.end_date || '',
        endTime: e.end_time ? e.end_time.substring(0,5) : '',
        location: e.location,
        desc: e.description,
        status: e.status,
        maxMembers: e.max_members,
        createdBy: e.created_by,
        signups: (e.event_signups || []).map(s => ({
          username: s.username,
          signedAt: new Date(s.signed_at).toLocaleString('th-TH')
        }))
      }));

      await autoMarkPastEventsDone();
    }

    renderAll(); 

    const { data: infoData } = await supabaseClient.from('info_items').select('*').order('sort_order', {ascending:true});
    if(infoData) infoItems = infoData;
    if(document.getElementById('view-info').style.display !== 'none') renderInfo();

  } catch (err) {
    console.error("เกิดข้อผิดพลาดในการโหลดข้อมูล:", err);
  }
}

// AUTH & REALTIME UI SETUP
function setupUILoggedIn(data) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'flex';
  document.getElementById('top-name').textContent = data.name;
  document.getElementById('top-avatar').textContent = data.av;
  document.getElementById('top-role').textContent = data.role_label;
  
  if (data.role === 'member') {
    document.getElementById('btn-add-cal').classList.add('hidden');
    document.getElementById('btn-add-list').classList.add('hidden');
  }
  
  const dbNavItems = document.querySelectorAll('[data-view="database"]');
  dbNavItems.forEach(el => {
    el.style.display = (data.role === 'president' || data.role === 'admin') ? '' : 'none';
  });

  if(data.role === 'president' || data.role === 'admin') {
    document.getElementById('btn-add-info').style.display = '';
  }
}

async function doLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  
  const { data, error } = await supabaseClient.from('users').select('*').eq('username', u).maybeSingle();
  
  if (data && data.password === p) {
    err.style.display = 'none';
    currentUser = { username: data.username, ...data, name: data.name, roleLabel: data.role_label, av: data.av };
    
    // บันทึกลง Local Storage
    localStorage.setItem('loggedInUser', data.username);
    
    setupUILoggedIn(data);
    await loadDataFromDB();
  } else { 
    err.style.display = 'block'; 
  }
}

document.getElementById('login-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
document.getElementById('login-user').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('login-pass').focus()});

function doLogout() {
  currentUser = null;
  // ล้าง Local Storage
  localStorage.removeItem('loggedInUser');
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

async function checkAutoLogin() {
  const savedUser = localStorage.getItem('loggedInUser');
  if (savedUser) {
    const { data, error } = await supabaseClient.from('users').select('*').eq('username', savedUser).maybeSingle();
    if (data) {
      currentUser = { username: data.username, ...data, name: data.name, roleLabel: data.role_label, av: data.av };
      setupUILoggedIn(data);
      await loadDataFromDB();
    } else {
      localStorage.removeItem('loggedInUser');
    }
  }
}

function setupRealtime() {
  supabaseClient
    .channel('public-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
      console.log('🔄 อัปเดตข้อมูล events แบบ Realtime');
      if (currentUser) loadDataFromDB();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_signups' }, payload => {
      console.log('🔄 อัปเดตข้อมูล event_signups แบบ Realtime');
      if (currentUser) loadDataFromDB();
    })
    .subscribe();
}

// NAVIGATION
function setView(view, el){
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
  
  const sideEl = document.querySelector(`.nav-item[data-view="${view}"]`);
  const botEl = document.querySelector(`.bottom-nav-item[data-view="${view}"]`);
  if(sideEl) sideEl.classList.add('active');
  if(botEl) botEl.classList.add('active');

  ['calendar','list','mytasks','members','database','info'].forEach(v => {
    const d = document.getElementById('view-'+v);
    if(d) d.style.display = v === view ? 'block' : 'none';
  });
  if(view === 'mytasks') renderMyTasks();
  if(view === 'database') renderDatabase();
  if(view === 'info') renderInfo();
}
function switchToView(view,btn){
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  setView(view, null); 
}

// HELPERS
const tClass=t=>({meeting:'ev-meeting',activity:'ev-activity',event:'ev-event',deadline:'ev-deadline',announce:'ev-announce'}[t]||'ev-meeting');
const tLabel=t=>({meeting:'ประชุม',activity:'กิจกรรม',event:'งานสำคัญ',deadline:'กำหนดส่ง',announce:'ประกาศ/แจ้งเพื่อทราบ'}[t]||t);
const tEmoji=t=>({meeting:'📋',activity:'🎉',event:'⭐',deadline:'⏰',announce:'📢'}[t]||'📌');
const sLabel=s=>({upcoming:'กำลังจะมาถึง',ongoing:'กำลังดำเนิน',done:'เสร็จสิ้น',cancelled:'ยกเลิก'}[s]||s);
const sTagClass=s=>({upcoming:'tag-upcoming',ongoing:'tag-ongoing',done:'tag-done',cancelled:'tag-cancelled'}[s]||'');
const bColor=t=>({meeting:'#d32f2f',activity:'#63991f',event:'#BA7517',deadline:'#e24b4a',announce:'#5c6bc0'}[t]||'#888');
const sBg=s=>({upcoming:'#ffebee',ongoing:'#FAEEDA',done:'#EAF3DE',cancelled:'#FCEBEB'}[s]);
const sColor=s=>({upcoming:'#b71c1c',ongoing:'#854F0B',done:'#3B6D11',cancelled:'#A32D2D'}[s]);
function dateFmt(d){if(!d)return'';const[y,m,day]=d.split('-');return`${parseInt(day)} ${THAI_MONTHS[parseInt(m)-1]} ${parseInt(y)+543}`}
function getU(username){return USERS[username]||{name:username,av:username[0]||'?',dept:'',roleLabel:''}}
function isSigned(ev){return currentUser&&ev.signups.some(s=>s.username===currentUser.username)}
function isSignupType(ev){return ev.type!=='announce'}
function canSignup(ev){return currentUser&&!isSigned(ev)&&ev.status==='upcoming'&&isSignupType(ev)&&(ev.maxMembers===0||ev.signups.length<ev.maxMembers)}
function slotInfo(ev){
  const cur=ev.signups.length,max=ev.maxMembers;
  if(max===0)return{pct:Math.min(cur*8,100),text:`${cur} คนลงชื่อ (ไม่จำกัด)`,full:false,cur,max};
  const pct=Math.min(Math.round(cur/max*100),100);
  return{pct,text:`${cur}/${max} คน`,full:cur>=max,cur,max};
}
function slotBarColor(ev){const{full,pct}=slotInfo(ev);return full?'#e24b4a':pct>=70?'#BA7517':'#3B6D11'}

// RENDER ALL
function renderAll(){renderCalendar();renderList();renderMembers();updateStats()}

// CALENDAR
function changeMonth(delta){
  calMonth+=delta;
  if(calMonth>11){calMonth=0;calYear++}
  if(calMonth<0){calMonth=11;calYear--}
  renderCalendar();
}
function renderCalendar(){
  const days=['อา','จ','อ','พ','พฤ','ศ','ส'];
  document.getElementById('cal-nav-label').textContent=`${THAI_MONTHS[calMonth]} ${calYear+543}`;
  document.getElementById('cal-month-title').textContent=`ปฏิทิน — ${THAI_MONTHS[calMonth]} ${calYear+543}`;
  document.getElementById('cal-header').innerHTML=days.map(d=>`<div class="cal-day-name">${d}</div>`).join('');
  const dIM=new Date(calYear,calMonth+1,0).getDate();
  const startDow=new Date(calYear,calMonth,1).getDay();
  const prevD=new Date(calYear,calMonth,0).getDate();
  let c='';
  for(let i=0;i<startDow;i++)c+=`<div class="cal-cell other-month"><div class="cal-date">${prevD-startDow+1+i}</div></div>`;
  for(let d=1;d<=dIM;d++){
    const isToday=d===TODAY.getDate()&&calMonth===TODAY.getMonth()&&calYear===TODAY.getFullYear();
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const pills=events.filter(e=>e.date===ds).map(e=>`<div class="event-pill ${tClass(e.type)}" onclick="showDetail(${e.id},event)">${tEmoji(e.type)} ${e.title}</div>`).join('');
    c+=`<div class="cal-cell${isToday?' today':''}"><div class="cal-date">${d}</div>${pills}</div>`;
  }
  const rem=(startDow+dIM)%7;
  for(let d=1;d<=(rem?7-rem:0);d++)c+=`<div class="cal-cell other-month"><div class="cal-date">${d}</div></div>`;
  document.getElementById('cal-body').innerHTML=c;
}

// LIST
function renderList(){
  const el=document.getElementById('event-list');
  const sorted=[...events].filter(e=>e.type!=='announce').sort((a,b)=>a.date.localeCompare(b.date));
  if(!sorted.length){el.innerHTML='<div class="empty-state">ยังไม่มีงานในระบบ</div>';return}
  el.innerHTML=sorted.map(e=>{
    const sf=slotInfo(e);const sc=slotBarColor(e);const signed=isSigned(e);
    return`<div class="event-card" onclick="showDetail(${e.id})">
      <div class="event-color-bar" style="background:${bColor(e.type)}"></div>
      <div class="event-info">
        <div class="event-name">${tEmoji(e.type)} ${e.title}</div>
        <div class="event-meta"><span>📅 ${dateFmt(e.date)}</span><span>🕐 ${e.time} น.</span>${e.location?`<span>📍 ${e.location}</span>`:''}</div>
        <div class="slot-bar-wrap">
          <div class="slot-bar-bg"><div class="slot-bar-fill" style="width:${sf.pct}%;background:${sc}"></div></div>
          <span class="slot-text${sf.full?' slot-full-text':''}">${sf.text}</span>
          ${signed?'<span class="signed-badge">✓ ลงชื่อแล้ว</span>':''}
        </div>
      </div>
      <div class="event-tags"><span class="tag ${sTagClass(e.status)}">${sLabel(e.status)}</span><span class="tag tag-type">${tLabel(e.type)}</span></div>
    </div>`}).join('');
}

// MY TASKS
function renderMyTasks(){
  if(!currentUser)return;
  const el=document.getElementById('my-tasks-content');
  const canCreate=currentUser.role!=='member';
  const myCreated=events.filter(e=>e.createdBy===currentUser.username&&e.type!=='announce');
  const mySigned=events.filter(e=>e.createdBy!==currentUser.username&&isSigned(e)&&e.type!=='announce');
  let html='';
  if(canCreate){
    html+=`<div class="task-section-label">📝 งานที่ฉันสร้าง — ${myCreated.length} งาน</div>`;
    html+=myCreated.length?myCreated.map(e=>myCreatedCard(e)).join(''):`<div class="empty-state" style="padding:1.5rem">ยังไม่มีงานที่สร้าง</div>`;
  }
  html+=`<div class="task-section-label" style="${canCreate?'margin-top:1.5rem':''}">✅ งานที่ฉันลงชื่อ — ${mySigned.length} งาน</div>`;
  html+=mySigned.length?mySigned.map(e=>{
    const my=e.signups.find(s=>s.username===currentUser.username);
    return`<div class="my-event-card">
      <div class="my-event-head">
        <div style="flex:1;min-width:0">
          <div class="my-event-name">${tEmoji(e.type)} ${e.title}</div>
          <div class="my-event-meta">📅 ${dateFmt(e.date)} · 🕐 ${e.time} น.${e.location?` · 📍 ${e.location}`:''}</div>
          <div class="my-event-meta" style="margin-top:2px;color:var(--g)">✍️ ลงชื่อเมื่อ ${my?my.signedAt:'-'}</div>
        </div>
        <div class="my-actions"><button class="btn-sm btn-danger" onclick="confirmUnsign(${e.id})">ยกเลิกลงชื่อ</button></div>
      </div>
    </div>`}).join(''):`<div class="empty-state" style="padding:1.5rem">ยังไม่มีงานที่ลงชื่อ<br><span style="font-size:12px">ไปดูรายการงานและกดลงชื่อได้เลย</span></div>`;
  el.innerHTML=html;
}

function myCreatedCard(e){
  const sf=slotInfo(e);const sc=slotBarColor(e);
  const rows=e.signups.map((s,i)=>{const u=getU(s.username);return`<div class="signup-row"><div class="signup-av-name"><span style="font-size:11px;color:var(--ht);width:18px;text-align:right">${i+1}</span><div class="signup-av-sm">${u.av}</div><span>${u.name}</span><span style="font-size:11px;color:var(--ht)">${u.dept}</span></div><span class="signup-time-text">${s.signedAt}</span></div>`}).join('');
  return`<div class="my-event-card">
    <div class="my-event-head">
      <div style="flex:1;min-width:0">
        <div class="my-event-name">${tEmoji(e.type)} ${e.title}</div>
        <div class="my-event-meta">📅 ${dateFmt(e.date)} · 🕐 ${e.time} น.${e.location?` · 📍 ${e.location}`:''}</div>
        <div class="slot-bar-wrap" style="margin-top:8px">
          <div class="slot-bar-bg"><div class="slot-bar-fill" style="width:${sf.pct}%;background:${sc}"></div></div>
          <span class="slot-text${sf.full?' slot-full-text':''}">${sf.text} ${e.maxMembers>0?`ต้องการ ${e.maxMembers} คน`:''}</span>
        </div>
      </div>
      <div class="my-actions">
        <button class="btn-sm btn-edit" onclick="openEditModal(${e.id})">✏️ แก้ไข</button>
        <button class="btn-sm btn-export" onclick="exportSignups(${e.id})">⬇️ Export CSV</button>
        <button class="btn-sm btn-danger" onclick="confirmDelete(${e.id})">🗑 ลบงาน</button>
      </div>
    </div>
    <div class="signup-list-wrap">
      <div class="signup-list-title">รายชื่อผู้ลงชื่อ (${e.signups.length} คน)</div>
      ${rows||'<div style="font-size:12px;color:var(--ht);padding:4px 0">ยังไม่มีผู้ลงชื่อ</div>'}
    </div>
  </div>`
}

// MEMBERS
function renderMembers(){
  document.getElementById('member-cards').innerHTML=MEMBERS_LIST.map(m=>`
    <div class="member-card">
      <div class="member-av">${m.av}</div>
      <div><div class="member-name">${m.name}</div><div class="member-dept">${m.dept}</div></div>
    </div>`).join('');
}

// STATS
function updateStats(){
  document.getElementById('stat-total').textContent=events.length;
  document.getElementById('stat-upcoming').textContent=events.filter(e=>e.status==='upcoming').length;
  if(currentUser)document.getElementById('stat-mysigned').textContent=events.filter(e=>isSigned(e)).length;
}

// ADD / EDIT
function openAddModal(){
  editingId=null;
  document.getElementById('modal-add-title').textContent='เพิ่มงานใหม่';
  ['f-title','f-desc','f-location'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-maxmembers').value='5';
  document.getElementById('f-type').value='meeting';
  document.getElementById('f-status').value='upcoming';
  document.getElementById('f-starttime').value='09:00';
  document.getElementById('f-endtime').value='12:00';
  const now=new Date();
  const d=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById('f-start').value=d;
  document.getElementById('f-end').value=d;
  onTypeChange('meeting');
  document.getElementById('modal-add').classList.add('open');
}
function onTypeChange(type){
  const signupWrap=document.getElementById('signup-fields-wrap');
  if(signupWrap) signupWrap.style.display = type==='announce' ? 'none' : '';
}
function openEditModal(id){
  const e=events.find(x=>x.id===id);if(!e)return;
  editingId=id;
  document.getElementById('modal-add-title').textContent='แก้ไขงาน';
  document.getElementById('f-title').value=e.title;
  document.getElementById('f-desc').value=e.desc||'';
  document.getElementById('f-location').value=e.location||'';
  document.getElementById('f-maxmembers').value=e.maxMembers||0;
  document.getElementById('f-type').value=e.type;
  document.getElementById('f-status').value=e.status;
  document.getElementById('f-start').value=e.date;
  document.getElementById('f-end').value=e.endDate||e.date;
  document.getElementById('f-starttime').value=e.time;
  document.getElementById('f-endtime').value=e.endTime||'12:00';
  onTypeChange(e.type);
  closeModal('modal-detail');
  document.getElementById('modal-add').classList.add('open');
}
async function saveEvent() {
  const title = document.getElementById('f-title').value.trim();
  if(!title){alert('กรุณากรอกชื่องาน');return}
  const mx = parseInt(document.getElementById('f-maxmembers').value) || 0;
  
  const payload = {
    title: title,
    type: document.getElementById('f-type').value,
    date: document.getElementById('f-start').value,
    time: document.getElementById('f-starttime').value + ':00', 
    end_date: document.getElementById('f-end').value || null,
    end_time: document.getElementById('f-endtime').value ? document.getElementById('f-endtime').value + ':00' : null,
    location: document.getElementById('f-location').value,
    description: document.getElementById('f-desc').value,
    status: document.getElementById('f-status').value,
    max_members: mx,
    created_by: currentUser.username
  };

  if(editingId !== null) {
    await supabaseClient.from('events').update(payload).eq('id', editingId);
    showToast('✅ แก้ไขงานเรียบร้อยแล้ว');
  } else {
    await supabaseClient.from('events').insert([payload]);
    showToast('✅ เพิ่มงานใหม่เรียบร้อยแล้ว');
  }
  
  closeModal('modal-add');
  await loadDataFromDB(); 
  if(document.getElementById('view-mytasks').style.display!=='none') renderMyTasks();
}

async function signupEvent(id) {
  const e = events.find(x => x.id === id);
  if (!e || !currentUser) return;
  if (isSigned(e)) { showToast('คุณลงชื่อแล้ว'); return; }
  if (e.maxMembers > 0 && e.signups.length >= e.maxMembers) { showToast('ขออภัย ที่นั่งเต็มแล้ว'); return; }
  
  const { error } = await supabaseClient.from('event_signups').insert([
    { event_id: id, username: currentUser.username }
  ]);

  if(!error){
    showToast('✍️ ลงชื่อสำเร็จ!');
    await loadDataFromDB();
    showDetail(id); 
  }
}

async function unsignEvent(id) {
  await supabaseClient.from('event_signups')
    .delete()
    .eq('event_id', id)
    .eq('username', currentUser.username);
    
  showToast('ยกเลิกลงชื่อเรียบร้อย');
  closeModal('modal-confirm');
  await loadDataFromDB();
  if(document.getElementById('view-mytasks').style.display!=='none') renderMyTasks();
}

async function deleteEvent(id) {
  await supabaseClient.from('events').delete().eq('id', id);
  
  closeModal('modal-confirm');
  showToast('🗑 ลบงานเรียบร้อย');
  await loadDataFromDB();
  if(document.getElementById('view-mytasks').style.display!=='none') renderMyTasks();
}
function confirmUnsign(id){
  const e=events.find(x=>x.id===id);
  document.getElementById('confirm-title').textContent='ยืนยันการยกเลิกลงชื่อ';
  document.getElementById('confirm-msg').textContent=`คุณต้องการยกเลิกการลงชื่อในงาน "${e.title}" ใช่หรือไม่?`;
  document.getElementById('confirm-ok').onclick=()=>unsignEvent(id);
  document.getElementById('modal-confirm').classList.add('open');
}
function confirmDelete(id){
  const e=events.find(x=>x.id===id);
  document.getElementById('confirm-title').textContent='ยืนยันการลบงาน';
  document.getElementById('confirm-msg').textContent=`ต้องการลบงาน "${e.title}" ออกจากระบบ? การดำเนินการนี้ไม่สามารถยกเลิกได้`;
  document.getElementById('confirm-ok').onclick=()=>deleteEvent(id);
  document.getElementById('modal-confirm').classList.add('open');
}

// EXPORT CSV
function exportSignups(id){
  const e=events.find(x=>x.id===id);if(!e)return;
  if(!e.signups.length){showToast('ยังไม่มีผู้ลงชื่อ');return}
  const rows=[
    ['ลำดับ','ชื่อ-นามสกุล','ชื่อผู้ใช้','ฝ่าย','ตำแหน่ง','วันเวลาที่ลงชื่อ'],
    ...e.signups.map((s,i)=>{const u=getU(s.username);return[i+1,u.name,s.username,u.dept,u.roleLabel,s.signedAt]})
  ];
  const BOM='\uFEFF';
  const csv=BOM+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),download:`รายชื่อ_${e.title}_${e.date}.csv`});
  a.click();URL.revokeObjectURL(a.href);
  showToast(`⬇️ Export รายชื่อ ${e.signups.length} คน เรียบร้อย`);
}
// CALENDAR
function changeMonth(delta){
  calMonth+=delta;
  if(calMonth>11){calMonth=0;calYear++}
  if(calMonth<0){calMonth=11;calYear--}
  renderCalendar();
}

function renderCalendar(){
  const days=['อา','จ','อ','พ','พฤ','ศ','ส'];
  document.getElementById('cal-nav-label').textContent=`${THAI_MONTHS[calMonth]} ${calYear+543}`;
  document.getElementById('cal-month-title').textContent=`ปฏิทิน — ${THAI_MONTHS[calMonth]} ${calYear+543}`;
  document.getElementById('cal-header').innerHTML=days.map(d=>`<div class="cal-day-name">${d}</div>`).join('');
  const dIM=new Date(calYear,calMonth+1,0).getDate();
  const startDow=new Date(calYear,calMonth,1).getDay();
  const prevD=new Date(calYear,calMonth,0).getDate();
  let c='';
  
  // วันที่ของเดือนก่อนหน้า
  for(let i=0;i<startDow;i++) {
    c+=`<div class="cal-cell other-month"><div class="cal-date">${prevD-startDow+1+i}</div></div>`;
  }
  
  // วันที่ของเดือนปัจจุบัน
  for(let d=1;d<=dIM;d++){
    const isToday=d===TODAY.getDate()&&calMonth===TODAY.getMonth()&&calYear===TODAY.getFullYear();
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    
    // ดึงงานทั้งหมดที่ครอบคลุมถึงวันที่นี้ (ds)
    const pills = events.filter(e => {
      const start = e.date;
      const end = e.endDate || e.date; // ถ้าไม่มี endDate ให้ใช้วันเริ่ม
      return ds >= start && ds <= end;
    })
    .sort((a,b) => a.id - b.id) // เรียงตาม ID เพื่อให้แท็บสีตรงกันในแนวนอน
    .map(e => {
      const isStart = ds === e.date;
      const isEnd = ds === (e.endDate || e.date);
      const isWeekStart = new Date(ds).getDay() === 0; // วันอาทิตย์ (ต้นสัปดาห์)
      
      let cls = tClass(e.type);
      
      // ถ้าเป็นกิจกรรมหลายวัน ให้ติดคลาสเพิ่มเพื่อใช้ CSS จัดการส่วนขอบให้ชนกัน
      if (e.endDate && e.endDate !== e.date) {
          cls += ' multi-day';
          if (isStart) cls += ' md-start';
          else if (isEnd) cls += ' md-end';
          else cls += ' md-mid';
      }

      // แสดงชื่อกิจกรรมเฉพาะวันแรก, วันต้นสัปดาห์, หรือวันที่ 1 ของเดือน เพื่อไม่ให้ข้อความรก
      const showTitle = isStart || isWeekStart || d === 1;
      const titleText = showTitle ? `${tEmoji(e.type)} ${e.title}` : `&nbsp;`;
      
      return `<div class="event-pill ${cls}" onclick="showDetail(${e.id},event)">${titleText}</div>`;
    }).join('');
    
    c+=`<div class="cal-cell${isToday?' today':''}"><div class="cal-date">${d}</div>${pills}</div>`;
  }
  
  // วันที่ของเดือนถัดไป
  const rem=(startDow+dIM)%7;
  for(let d=1;d<=(rem?7-rem:0);d++) {
    c+=`<div class="cal-cell other-month"><div class="cal-date">${d}</div></div>`;
  }
  document.getElementById('cal-body').innerHTML=c;
}
// DETAIL MODAL
function showDetail(id,ev){
  if(ev)ev.stopPropagation();
  const e=events.find(x=>x.id===id);if(!e)return;
  const sf=slotInfo(e);const sc=slotBarColor(e);
  const signed=isSigned(e);const canSign=canSignup(e);
  const isOwner=currentUser&&(e.createdBy===currentUser.username||currentUser.role==='president');
  document.getElementById('detail-title').textContent=`${tEmoji(e.type)} ${e.title}`;
  document.getElementById('detail-tags').innerHTML=`
    <span class="detail-tag" style="background:${sBg(e.status)};color:${sColor(e.status)}">${sLabel(e.status)}</span>
    <span class="detail-tag" style="background:var(--s2);color:var(--mt)">${tLabel(e.type)}</span>
    ${sf.full?'<span class="detail-tag" style="background:var(--rl);color:var(--r)">ที่นั่งเต็ม</span>':''}`;
  document.getElementById('detail-body').innerHTML=`
    <div class="detail-info-row"><span class="detail-icon">📅</span><span>${dateFmt(e.date)} เวลา ${e.time} น.${e.endDate?` — ${dateFmt(e.endDate)} ${e.endTime} น.`:''}</span></div>
    ${e.location?`<div class="detail-info-row"><span class="detail-icon">📍</span><span>${e.location}</span></div>`:''}
    ${e.desc?`<div class="detail-info-row"><span class="detail-icon">📝</span><span>${e.desc}</span></div>`:''}
    <div class="detail-info-row"><span class="detail-icon">👤</span><span>ผู้สร้าง: ${getU(e.createdBy).name}</span></div>`;
  const signupItems=e.signups.map((s,i)=>{const u=getU(s.username);return`<div class="signup-item">
    <div class="signup-item-left"><span style="font-size:11px;color:var(--ht);width:20px;text-align:right">${i+1}</span><div class="av-sm">${u.av}</div><div><div>${u.name}</div><div class="signup-dept">${u.dept}</div></div></div>
    <span style="font-size:11px;color:var(--ht)">${s.signedAt}</span>
  </div>`}).join('');
  document.getElementById('detail-signup-section').innerHTML= !isSignupType(e)
    ? `<div class="announce-notice">📢 กิจกรรมนี้เป็นการแจ้งเพื่อทราบ ไม่มีระบบลงชื่อเข้าร่วม</div>`
    : `
    <div class="signup-progress-box">
      <div class="signup-progress-head">
        <div>
          <div class="slot-big${sf.full?' full':''}">${sf.text}</div>
          <div class="slot-sublabel">${e.maxMembers>0?`ต้องการ ${e.maxMembers} คน`:'รับสมัครไม่จำกัด'}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--mt)">${sf.pct}%</div>
      </div>
      <div class="bar-bg"><div class="bar-fill" style="width:${sf.pct}%;background:${sc}"></div></div>
      ${e.signups.length?`<div>${signupItems}</div>`:'<div style="font-size:12px;color:var(--ht);text-align:center;padding:6px 0">ยังไม่มีผู้ลงชื่อ — เป็นคนแรกได้เลย!</div>'}
    </div>
    ${canSign?`<button class="btn-signup-big" onclick="signupEvent(${e.id})">✍️ ลงชื่อเข้าร่วมงานนี้</button>`:''}
    ${signed?`<button class="btn-unsign-big" onclick="confirmUnsign(${e.id})">✕ ยกเลิกการลงชื่อของฉัน</button>`:''}
    ${sf.full&&!signed?'<p style="text-align:center;font-size:13px;color:var(--r);margin-top:10px;font-weight:600">ขออภัย ที่นั่งเต็มแล้ว</p>':''}
    ${e.status!=='upcoming'&&!signed?`<p style="text-align:center;font-size:12px;color:var(--ht);margin-top:10px">งานนี้ ${sLabel(e.status)} แล้ว ไม่สามารถลงชื่อได้</p>`:''}`;
  document.getElementById('detail-owner-actions').innerHTML=isOwner?`
    <div class="owner-actions">
      <button class="btn-sm btn-edit" onclick="openEditModal(${e.id})">✏️ แก้ไขงาน</button>
      ${isSignupType(e)?`<button class="btn-sm btn-export" onclick="exportSignups(${e.id})">⬇️ Export รายชื่อ (.csv)</button>`:''}
      <button class="btn-sm btn-danger" onclick="confirmDelete(${e.id})">🗑 ลบงาน</button>
    </div>`:'';
  document.getElementById('modal-detail').classList.add('open');
}

// INFO VIEW
const linkTypeIcon = t => ({
  url:'🔗', gdoc:'📄', gsheet:'📊', gslide:'📑', gdrive:'📁', fb:'📘', word:'📝'
}[t] || '🔗');
const linkTypeLabel = t => ({
  url:'ลิงก์', gdoc:'Google Docs', gsheet:'Google Sheets', gslide:'Google Slides',
  gdrive:'Google Drive', fb:'Facebook', word:'Word'
}[t] || 'ลิงก์');
const linkTypeBg = t => ({
  url:'#e8f0fe', gdoc:'#e6f4ea', gsheet:'#e6f4ea', gslide:'#fce8b2',
  gdrive:'#e8f0fe', fb:'#e7f3ff', word:'#e8f0fe'
}[t] || '#f5f5f5');
const linkTypeColor = t => ({
  url:'#1a73e8', gdoc:'#1e8e3e', gsheet:'#188038', gslide:'#f29900',
  gdrive:'#1a73e8', fb:'#1877f2', word:'#2b5eb8'
}[t] || '#555');

let editingInfoId = null;

function renderInfo() {
  const el = document.getElementById('info-content');
  if(!el) return;
  if(!infoItems.length) {
    el.innerHTML = '<div class="empty-state">ยังไม่มีรายการข้อมูล</div>';
    return;
  }
  const isAdmin = currentUser && (currentUser.role === 'president' || currentUser.role === 'admin');
  el.innerHTML = `
    <div class="info-table-wrap">
      <table class="info-table">
        <thead>
          <tr>
            <th>รายการ</th>
            <th>ข้อมูล / ลิงก์</th>
            ${isAdmin ? '<th>จัดการ</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${infoItems.map(item => `
            <tr class="info-row">
              <td class="info-label-cell">
                <div class="info-item-label">${item.label}</div>
                ${item.note ? `<div class="info-item-note">${item.note}</div>` : ''}
              </td>
              <td class="info-link-cell">
                <a class="info-link-chip" href="${item.url}" target="_blank" rel="noopener">
                  <span class="info-link-icon" style="background:${linkTypeBg(item.link_type)};color:${linkTypeColor(item.link_type)}">${linkTypeIcon(item.link_type)}</span>
                  <span class="info-link-text">${item.display_text || linkTypeLabel(item.link_type)}</span>
                  <span class="info-link-arrow">↗</span>
                </a>
              </td>
              ${isAdmin ? `<td class="info-actions-cell">
                <button class="btn-sm btn-edit" onclick="openEditInfoModal(${item.id})">✏️</button>
                <button class="btn-sm btn-danger" onclick="confirmDeleteInfo(${item.id})">🗑</button>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function openAddInfoModal() {
  editingInfoId = null;
  document.getElementById('modal-info-title').textContent = 'เพิ่มรายการข้อมูล';
  document.getElementById('fi-label').value = '';
  document.getElementById('fi-url').value = '';
  document.getElementById('fi-note').value = '';
  document.getElementById('fi-linktype').value = 'url';
  document.getElementById('modal-info').classList.add('open');
}

function openEditInfoModal(id) {
  const item = infoItems.find(x => x.id === id);
  if(!item) return;
  editingInfoId = id;
  document.getElementById('modal-info-title').textContent = 'แก้ไขรายการข้อมูล';
  document.getElementById('fi-label').value = item.label;
  document.getElementById('fi-url').value = item.url;
  document.getElementById('fi-note').value = item.note || '';
  document.getElementById('fi-linktype').value = item.link_type || 'url';
  document.getElementById('modal-info').classList.add('open');
}

async function saveInfoItem() {
  const label = document.getElementById('fi-label').value.trim();
  const url   = document.getElementById('fi-url').value.trim();
  if(!label || !url) { alert('กรุณากรอกชื่อรายการและ URL'); return; }
  const linkType = document.getElementById('fi-linktype').value;
  const note  = document.getElementById('fi-note').value.trim();

  let displayText = linkTypeLabel(linkType);
  try {
    const hostname = new URL(url).hostname.replace('www.','');
    if(url.includes('docs.google.com')) displayText = label;
    else if(url.includes('drive.google.com')) displayText = label;
    else if(url.includes('facebook.com')) displayText = 'Link';
    else displayText = hostname || linkTypeLabel(linkType);
  } catch(_){}

  const payload = { label, url, link_type: linkType, note, display_text: displayText,
    sort_order: editingInfoId ? undefined : (infoItems.length + 1) };

  if(editingInfoId) {
    await supabaseClient.from('info_items').update(payload).eq('id', editingInfoId);
    showToast('✅ แก้ไขรายการเรียบร้อย');
  } else {
    await supabaseClient.from('info_items').insert([payload]);
    showToast('✅ เพิ่มรายการเรียบร้อย');
  }
  closeModal('modal-info');
  const { data } = await supabaseClient.from('info_items').select('*').order('sort_order', {ascending:true});
  if(data) infoItems = data;
  renderInfo();
}

function confirmDeleteInfo(id) {
  const item = infoItems.find(x => x.id === id);
  document.getElementById('confirm-title').textContent = 'ยืนยันการลบรายการ';
  document.getElementById('confirm-msg').textContent = `ต้องการลบรายการ "${item.label}" ออกจากระบบ?`;
  document.getElementById('confirm-ok').onclick = () => deleteInfoItem(id);
  document.getElementById('modal-confirm').classList.add('open');
}

async function deleteInfoItem(id) {
  await supabaseClient.from('info_items').delete().eq('id', id);
  closeModal('modal-confirm');
  showToast('🗑 ลบรายการเรียบร้อย');
  const { data } = await supabaseClient.from('info_items').select('*').order('sort_order', {ascending:true});
  if(data) infoItems = data;
  renderInfo();
}

// DATABASE VIEW
function renderDatabase(){
  const el=document.getElementById('db-content');if(!el)return;
  const totalSignups=events.reduce((s,e)=>s+e.signups.length,0);
  const byType={meeting:0,activity:0,event:0,deadline:0};
  events.forEach(e=>{if(byType[e.type]!==undefined)byType[e.type]++});

  let html=`
  <div class="db-stats-row">
    <div class="db-stat-box"><div class="db-stat-n">${events.length}</div><div class="db-stat-l">งานทั้งหมด</div></div>
    <div class="db-stat-box"><div class="db-stat-n" style="color:var(--g)">${totalSignups}</div><div class="db-stat-l">รายการลงชื่อ</div></div>
    <div class="db-stat-box"><div class="db-stat-n" style="color:var(--a)">${Object.values(USERS).length}</div><div class="db-stat-l">ผู้ใช้งาน</div></div>
    <div class="db-stat-box"><div class="db-stat-n" style="color:var(--p)">${events.filter(e=>e.status==='upcoming').length}</div><div class="db-stat-l">งานที่รอดำเนิน</div></div>
  </div>

  <div class="db-section">
    <div class="db-section-head">
      <div class="db-section-title">📋 ตาราง events (${events.length} รายการ)</div>
      <button class="btn-sm btn-export" onclick="exportAllEvents()">⬇️ Export CSV</button>
    </div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr><th>ID</th><th>ชื่องาน</th><th>ประเภท</th><th>สถานะ</th><th>วันที่</th><th>เวลา</th><th>สถานที่</th><th>Max</th><th>ลงชื่อ</th><th>สร้างโดย</th></tr></thead>
        <tbody>${events.map(e=>`<tr>
          <td><span class="db-id">${e.id}</span></td>
          <td style="font-weight:600">${tEmoji(e.type)} ${e.title}</td>
          <td><span class="db-badge" style="background:${sBg(e.status)||'#f5f5f5'};color:${sColor(e.status)||'#888'}">${tLabel(e.type)}</span></td>
          <td><span class="db-badge" style="background:${sBg(e.status)};color:${sColor(e.status)}">${sLabel(e.status)}</span></td>
          <td>${e.date}</td>
          <td>${e.time}</td>
          <td>${e.location||'—'}</td>
          <td style="text-align:center">${e.maxMembers===0?'∞':e.maxMembers}</td>
          <td style="text-align:center;font-weight:600;color:${e.signups.length>0?'var(--g)':'var(--ht)'}">${e.signups.length}</td>
          <td>${getU(e.createdBy).name}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </div>

  <div class="db-section">
    <div class="db-section-head">
      <div class="db-section-title">✍️ ตาราง event_signups (${totalSignups} รายการ)</div>
      <button class="btn-sm btn-export" onclick="exportAllSignups()">⬇️ Export CSV</button>
    </div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr><th>Event ID</th><th>ชื่องาน</th><th>Username</th><th>ชื่อผู้ลงชื่อ</th><th>ฝ่าย</th><th>ตำแหน่ง</th><th>วันเวลาที่ลงชื่อ</th></tr></thead>
        <tbody>${events.flatMap(e=>e.signups.map(s=>{const u=getU(s.username);return`<tr>
          <td><span class="db-id">${e.id}</span></td>
          <td style="font-weight:600">${e.title}</td>
          <td><code style="font-size:11px;background:var(--s2);padding:2px 6px;border-radius:4px">${s.username}</code></td>
          <td>${u.name}</td>
          <td>${u.dept||'—'}</td>
          <td>${u.roleLabel||'—'}</td>
          <td style="font-size:11px;color:var(--ht)">${s.signedAt}</td>
        </tr>`})).join('')||`<tr><td colspan="7" style="text-align:center;color:var(--ht);padding:16px">ยังไม่มีรายการลงชื่อ</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <div class="db-section">
    <div class="db-section-head">
      <div class="db-section-title">👥 ตาราง users (${MEMBERS_LIST.length} รายการ)</div>
    </div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr><th>Username</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>Role</th><th>ฝ่าย</th><th>AV</th><th>งานที่สร้าง</th><th>งานที่ลงชื่อ</th></tr></thead>
        <tbody>${MEMBERS_LIST.map(m=>{
          const created=events.filter(e=>e.createdBy===m.username).length;
          const signed=events.filter(e=>e.signups.some(s=>s.username===m.username)).length;
          return`<tr>
            <td><code style="font-size:11px;background:var(--s2);padding:2px 6px;border-radius:4px">${m.username}</code></td>
            <td style="font-weight:600">${m.name}</td>
            <td>${m.role_label||'—'}</td>
            <td><span class="db-badge" style="background:var(--pl);color:var(--p)">${m.role}</span></td>
            <td>${m.dept||'—'}</td>
            <td style="font-size:16px;text-align:center">${m.av}</td>
            <td style="text-align:center;color:${created>0?'var(--p)':'var(--ht)'};font-weight:${created>0?'600':'400'}">${created}</td>
            <td style="text-align:center;color:${signed>0?'var(--g)':'var(--ht)'};font-weight:${signed>0?'600':'400'}">${signed}</td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  el.innerHTML=html;
}

function exportAllEvents(){
  const rows=[
    ['ID','ชื่องาน','ประเภท','สถานะ','วันที่','เวลาเริ่ม','วันสิ้นสุด','เวลาสิ้นสุด','สถานที่','รายละเอียด','Max','จำนวนลงชื่อ','สร้างโดย'],
    ...events.map(e=>[e.id,e.title,tLabel(e.type),sLabel(e.status),e.date,e.time,e.endDate||'',e.endTime||'',e.location||'',e.desc||'',e.maxMembers===0?'ไม่จำกัด':e.maxMembers,e.signups.length,getU(e.createdBy).name])
  ];
  downloadCSV(rows,`events_all_${new Date().toISOString().slice(0,10)}.csv`);
  showToast('⬇️ Export ตาราง events เรียบร้อย');
}

function exportAllSignups(){
  const rows=[
    ['Event ID','ชื่องาน','Username','ชื่อผู้ลงชื่อ','ฝ่าย','ตำแหน่ง','วันเวลาที่ลงชื่อ'],
    ...events.flatMap(e=>e.signups.map(s=>{const u=getU(s.username);return[e.id,e.title,s.username,u.name,u.dept||'',u.roleLabel||'',s.signedAt]}))
  ];
  downloadCSV(rows,`signups_all_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`⬇️ Export ตาราง signups ${rows.length-1} รายการ เรียบร้อย`);
}

function downloadCSV(rows,filename){
  const BOM='\uFEFF';
  const csv=BOM+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),download:filename});
  a.click();URL.revokeObjectURL(a.href);
}

// UTIL
function closeModal(id){document.getElementById(id).classList.remove('open')}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open')}));
let toastT;
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600)}

// INIT
checkAutoLogin();
setupRealtime();
