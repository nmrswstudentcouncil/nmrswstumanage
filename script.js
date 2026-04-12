// DATA
// ไปที่ Supabase > Project Settings > API เพื่อเอา URL และ anon key มาใส่ตรงนี้
const SUPABASE_URL = 'https://hgwswhcbfwegoantrhqy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VUlRS97KudTUCEOo2HptRw_suOf3CbS';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ลบ const USERS = {...} และ let events = [...] แบบเดิมทิ้งไป 
// แล้วใช้ตัวแปรเปล่าแบบนี้แทน
let USERS = {};
let MEMBERS_LIST = [];
let events = [];

let currentUser=null,nextId=20,editingId=null;
let calYear=2026,calMonth=3;
const TODAY=new Date(2026,3,12);
const THAI_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

async function loadDataFromDB() {
  try {
    // โหลด Users
    const { data: userData, error: userError } = await supabaseClient.from('users').select('*');
    if (userError) throw userError;

    if (userData) {
      USERS = {};
      userData.forEach(u => {
        USERS[u.username] = { pass: u.password, name: u.name, roleLabel: u.role_label, role: u.role, av: u.av, dept: u.dept };
      });
      MEMBERS_LIST = userData;
    }

    // โหลด Events และ Signups
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
    }

    renderAll(); 
  } catch (err) {
    console.error("เกิดข้อผิดพลาดในการโหลดข้อมูล:", err);
  }
}

// AUTH
async function doLogin() {
  const u = document.getElementById('login-user').value.trim().toLowerCase();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  
  const { data, error } = await supabaseClient.from('users').select('*').eq('username', u).maybeSingle();
  
  if (data && data.password === p) {
    err.style.display = 'none';
    currentUser = { username: data.username, ...data, name: data.name, roleLabel: data.role_label, av: data.av };
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'flex';
    document.getElementById('top-name').textContent = data.name;
    document.getElementById('top-avatar').textContent = data.av;
    document.getElementById('top-role').textContent = data.role_label;
    
    if (data.role === 'member') {
      document.getElementById('btn-add-cal').classList.add('hidden');
      document.getElementById('btn-add-list').classList.add('hidden');
    }
    
    // โหลดข้อมูลทั้งหมดเมื่อล็อกอินสำเร็จ
    await loadDataFromDB();
  } else { 
    err.style.display = 'block'; 
  }
}
document.getElementById('login-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
document.getElementById('login-user').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('login-pass').focus()});
function doLogout(){currentUser=null;document.getElementById('main-screen').style.display='none';document.getElementById('login-screen').style.display='flex';document.getElementById('login-user').value='';document.getElementById('login-pass').value=''}

// NAVIGATION
function setView(view,el){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el)el.classList.add('active');
  ['calendar','list','mytasks','members','database'].forEach(v=>{
    const d=document.getElementById('view-'+v);
    if(d)d.style.display=v===view?'block':'none';
  });
  if(view==='mytasks')renderMyTasks();
}
function switchToView(view,btn){
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  setView(view,document.querySelector(`[data-view="${view}"]`));
}

// HELPERS
const tClass=t=>({meeting:'ev-meeting',activity:'ev-activity',event:'ev-event',deadline:'ev-deadline'}[t]||'ev-meeting');
const tLabel=t=>({meeting:'ประชุม',activity:'กิจกรรม',event:'งานสำคัญ',deadline:'กำหนดส่ง'}[t]||t);
const tEmoji=t=>({meeting:'📋',activity:'🎉',event:'⭐',deadline:'⏰'}[t]||'📌');
const sLabel=s=>({upcoming:'กำลังจะมาถึง',ongoing:'กำลังดำเนิน',done:'เสร็จสิ้น',cancelled:'ยกเลิก'}[s]||s);
const sTagClass=s=>({upcoming:'tag-upcoming',ongoing:'tag-ongoing',done:'tag-done',cancelled:'tag-cancelled'}[s]||'');
const bColor=t=>({meeting:'#1a56db',activity:'#63991f',event:'#BA7517',deadline:'#e24b4a'}[t]||'#888');
const sBg=s=>({upcoming:'#e8f0fe',ongoing:'#FAEEDA',done:'#EAF3DE',cancelled:'#FCEBEB'}[s]);
const sColor=s=>({upcoming:'#1449b8',ongoing:'#854F0B',done:'#3B6D11',cancelled:'#A32D2D'}[s]);
function dateFmt(d){if(!d)return'';const[y,m,day]=d.split('-');return`${parseInt(day)} ${THAI_MONTHS[parseInt(m)-1]} ${parseInt(y)+543}`}
function getU(username){return USERS[username]||{name:username,av:username[0]||'?',dept:'',roleLabel:''}}
function isSigned(ev){return currentUser&&ev.signups.some(s=>s.username===currentUser.username)}
function canSignup(ev){return currentUser&&!isSigned(ev)&&ev.status==='upcoming'&&(ev.maxMembers===0||ev.signups.length<ev.maxMembers)}
function slotInfo(ev){
  const cur=ev.signups.length,max=ev.maxMembers;
  if(max===0)return{pct:Math.min(cur*8,100),text:`${cur} คนลงชื่อ (ไม่จำกัด)`,full:false,cur,max};
  const pct=Math.min(Math.round(cur/max*100),100);
  return{pct,text:`${cur}/${max} คน`,full:cur>=max,cur,max};
}
function slotBarColor(ev){const{full,pct}=slotInfo(ev);return full?'#e24b4a':pct>=70?'#BA7517':'#3B6D11'}
function nowStr(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}

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
  const sorted=[...events].sort((a,b)=>a.date.localeCompare(b.date));
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
  const myCreated=events.filter(e=>e.createdBy===currentUser.username);
  const mySigned=events.filter(e=>e.createdBy!==currentUser.username&&isSigned(e));
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
  const d=`${calYear}-${String(calMonth+1).padStart(2,'0')}-12`;
  document.getElementById('f-start').value=d;
  document.getElementById('f-end').value=d;
  document.getElementById('modal-add').classList.add('open');
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
    time: document.getElementById('f-starttime').value + ':00', // DB ต้องการวินาที
    end_date: document.getElementById('f-end').value || null,
    end_time: document.getElementById('f-endtime').value ? document.getElementById('f-endtime').value + ':00' : null,
    location: document.getElementById('f-location').value,
    description: document.getElementById('f-desc').value,
    status: document.getElementById('f-status').value,
    max_members: mx,
    created_by: currentUser.username
  };

  if(editingId !== null) {
    // แก้ไข
    await supabaseClient.from('events').update(payload).eq('id', editingId);
    showToast('✅ แก้ไขงานเรียบร้อยแล้ว');
  } else {
    // เพิ่มใหม่
    await supabaseClient.from('events').insert([payload]);
    showToast('✅ เพิ่มงานใหม่เรียบร้อยแล้ว');
  }
  
  closeModal('modal-add');
  await loadDataFromDB(); // โหลดข้อมูลใหม่จาก DB
  if(document.getElementById('view-mytasks').style.display!=='none') renderMyTasks();
}

async function signupEvent(id) {
  const e = events.find(x => x.id === id);
  if (!e || !currentUser) return;
  if (isSigned(e)) { showToast('คุณลงชื่อแล้ว'); return; }
  if (e.maxMembers > 0 && e.signups.length >= e.maxMembers) { showToast('ขออภัย ที่นั่งเต็มแล้ว'); return; }
  
  // บันทึกลง Database
  const { error } = await supabaseClient.from('event_signups').insert([
    { event_id: id, username: currentUser.username }
  ]);

  if(!error){
    showToast('✍️ ลงชื่อสำเร็จ!');
    await loadDataFromDB();
    showDetail(id); // รีเฟรช Modal รายละเอียด
  }
}

async function unsignEvent(id) {
  // ลบข้อมูลจาก Database
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
  // ลบข้อมูลจาก Database
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
  document.getElementById('detail-signup-section').innerHTML=`
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
      <button class="btn-sm btn-export" onclick="exportSignups(${e.id})">⬇️ Export รายชื่อ (.csv)</button>
      <button class="btn-sm btn-danger" onclick="confirmDelete(${e.id})">🗑 ลบงาน</button>
    </div>`:'';
  document.getElementById('modal-detail').classList.add('open');
}

// UTIL
function closeModal(id){document.getElementById(id).classList.remove('open')}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open')}));
let toastT;
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600)}