import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { pushConfig } from './push-config.js';

const gate = document.querySelector('#authGate');
const appRoot = document.querySelector('.app');
const configured = !Object.values(firebaseConfig).some(v => typeof v !== 'string' || v.startsWith('REPLACE_'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
if (!configured) { gate.textContent = 'Firebase setup is not finished yet.'; throw new Error('Firebase config missing'); }

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const profileRef = uid => doc(db, 'users', uid);
const pushConfigured = !Object.values(pushConfig).some(v => typeof v !== 'string' || v.startsWith('REPLACE_'));
let pushInitPromise;
function initializePush() {
  if (!pushConfigured || !window.OneSignalDeferred) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
  }
  if (!pushConfigured) return Promise.reject(new Error('Push service setup is not finished.'));
  if (!pushInitPromise) pushInitPromise = new Promise((resolve, reject) => {
    window.OneSignalDeferred.push(async OneSignal => {
      try {
        await OneSignal.init({
          appId: pushConfig.oneSignalAppId,
          serviceWorkerPath: 'onesignal/OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/salah/onesignal/' },
          notifyButton: { enable: false }
        });
        if (currentUser) await OneSignal.login(currentUser.uid);
        resolve(OneSignal);
      } catch (error) { reject(error); }
    });
  });
  return pushInitPromise;
}
async function sendPushSettings(enabled = true) {
  if (!pushConfigured || !currentUser) return false;
  const token = await currentUser.getIdToken();
  const response = await fetch(`${pushConfig.schedulerUrl.replace(/\/$/, '')}/api/profile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prayerTimes: saved, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tone: toneSelect.value, enabled })
  });
  if (!response.ok) throw new Error('Could not sync push reminder settings.');
  return true;
}
async function sendPushCheckIn(prayer) {
  if (!pushConfigured || !currentUser) return;
  const token = await currentUser.getIdToken();
  await fetch(`${pushConfig.schedulerUrl.replace(/\/$/, '')}/api/check-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prayer })
  });
}
async function recordActivity(event, details = {}) {
  await addDoc(collection(db, 'activity'), {uid:currentUser.uid, event, details, occurredAt:serverTimestamp()});
}
const prayers = [['Fajr','الفجر'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']];
const timesEl = document.querySelector('#times');
const listEl = document.querySelector('#list');
const statusEl = document.querySelector('#status');
const editCounter = document.querySelector('#editCounter');
const saveTimesButton = document.querySelector('#saveTimes');
const editMessage = document.querySelector('#editMessage');
const nameInput = document.querySelector('#person');
const greeting = document.querySelector('#greeting');
const toneSelect = document.querySelector('#tone');
let currentUser, profile, saved = ['', '', '', '', ''], draft = saved.slice(), done = {};
let notified = JSON.parse(sessionStorage.getItem('salah-notified-v1') || '{}');
const doneKey = () => `salah-done-v2:${currentUser.uid}:${new Date().toDateString()}`;

document.querySelector('#date').textContent = new Intl.DateTimeFormat(undefined, {weekday:'short',month:'short',day:'numeric'}).format(new Date());
function showStatus(message, target = statusEl) { target.textContent = message; target.style.display = 'block'; }
function updateEditUI() {
  const thisMonth=new Date();thisMonth.setUTCDate(1);thisMonth.setUTCHours(0,0,0,0);
  const used = profile?.editMonthStart?.toDate?.().toISOString() === thisMonth.toISOString() ? Number(profile.editsUsed || 0) : 0;
  const ready = profile?.hasInitialTimes === true;
  const locked = ready && used >= 3;
  editCounter.textContent = !ready ? 'Set your initial times, then save. Initial setup is free.' : locked ? 'All 3 time changes used this month. Editing unlocks next month.' : `${3-used} of 3 time changes left this month. One save counts as one change across all five prayers.`;
  timesEl.querySelectorAll('input').forEach(input => input.disabled = locked);
  saveTimesButton.disabled = locked || draft.some(v => !v) || draft.every((v,i) => v === saved[i]);
}
function draw() {
  timesEl.replaceChildren(); listEl.replaceChildren();
  prayers.forEach(([name, arabic], i) => {
    const row = document.createElement('div'); row.className = 'row';
    const label = document.createElement('div'); label.innerHTML = `<div class="name">${name}</div><div class="arabic">${arabic}</div>`;
    const input = document.createElement('input'); input.className = 'time'; input.type = 'time'; input.setAttribute('aria-label', `${name} time`); input.value = draft[i] || '';
    input.addEventListener('input', () => { draft[i] = input.value; editMessage.style.display='none'; updateEditUI(); });
    row.append(label, input); timesEl.append(row);
    const item = document.createElement('div'); item.className = 'prayer';
    item.innerHTML = `<div class="p-left"><i class="dot"></i><div><div class="name">${name}</div><div class="tag">${saved[i] || 'Set a time'}</div></div></div>`;
    const button = document.createElement('button'); button.className = `stop ${done[i] ? 'done' : ''}`; button.textContent = done[i] ? 'I’m in ✓' : 'I’m in'; button.disabled = done[i];
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await recordActivity('prayer_checked_in',{prayer:name}); done[i] = true; localStorage.setItem(doneKey(), JSON.stringify(done)); try { await sendPushCheckIn(name); } catch {} draw(); }
      catch { button.disabled = false; showStatus('Could not save this check-in. Please try again.'); }
    });
    item.append(button); listEl.append(item);
  });
  updateEditUI();
}
function updateGreeting() { const n = nameInput.value.trim(); greeting.textContent = n ? `Assalamu alaikum, ${n}.` : 'Make space for prayer.'; }
async function saveProfile() {
  try { await updateDoc(profileRef(currentUser.uid),{name:nameInput.value.trim(),tone:toneSelect.value,lastActiveAt:serverTimestamp()}); profile.name=nameInput.value.trim(); profile.tone=toneSelect.value; updateGreeting(); if (pushConfigured && 'Notification' in window && Notification.permission === 'granted') await sendPushSettings(true); }
  catch { showStatus('Could not save your settings. Please try again.'); }
}
document.querySelector('#saveName').addEventListener('click', saveProfile);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveProfile(); });
toneSelect.addEventListener('change', saveProfile);
saveTimesButton.addEventListener('click', async () => {
  if (draft.some(v => !v)) { showStatus('Enter a time for all five prayers.', editMessage); return; }
  saveTimesButton.disabled = true;
  try {
    const ref=profileRef(currentUser.uid), monthStart=new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
    let initial=false, remaining=0;
    await runTransaction(db,async tx=>{const snap=await tx.get(ref);const data=snap.data()||{};initial=data.hasInitialTimes!==true;const sameMonth=data.editMonthStart?.toDate?.().toISOString()===monthStart.toISOString();const used=sameMonth?Number(data.editsUsed||0):0;if(!initial&&used>=3)throw new Error('MONTH_LIMIT');const nextUsed=initial?0:used+1;remaining=3-nextUsed;tx.update(ref,{prayerTimes:draft,hasInitialTimes:true,editMonthStart:monthStart,editsUsed:nextUsed,lastActiveAt:serverTimestamp()});});
    saved = draft.slice(); profile.prayerTimes=saved; profile.hasInitialTimes=true; profile.editMonthStart={toDate:()=>monthStart}; profile.editsUsed=3-remaining;
    showStatus(initial ? 'Initial prayer times saved. You have 3 changes this month.' : `Prayer times saved. ${remaining} changes left this month.`, editMessage); draw();
    if (pushConfigured && 'Notification' in window && Notification.permission === 'granted') { try { await sendPushSettings(true); } catch { showStatus('Times saved, but background reminders could not sync.', editMessage); } }
  } catch (error) {
    showStatus(error.message === 'MONTH_LIMIT' || profile?.editsUsed>=3 ? 'All 3 time changes have been used this month.' : error.message || 'Could not save prayer times. Try again.', editMessage);
    updateEditUI();
  }
});

function playTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const mode = toneSelect.value; const notes = mode==='bell'?[880,660,880]:mode==='adhan'?[440,554,659,554]:[660,880];
    notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=mode==='bell'?'sine':'triangle';o.frequency.value=f;g.gain.setValueAtTime(.0001,ctx.currentTime+i*.28);g.gain.exponentialRampToValueAtTime(.16,ctx.currentTime+i*.28+.025);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.28+.22);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+i*.28);o.stop(ctx.currentTime+i*.28+.24);});
    setTimeout(()=>ctx.close(), 1500);
  } catch {}
}
document.querySelector('#preview').addEventListener('click', playTone);
function minuteOf(hm) { if (!hm) return -1; const [h,m]=hm.split(':').map(Number); return h*60+m; }
function tick() {
  const now=new Date(), minute=now.getHours()*60+now.getMinutes();
  prayers.forEach(([name],i)=>{
    if (done[i]) return;
    const delta=minuteOf(saved[i])-minute; if (![15,5,1,0].includes(delta)) return;
    const id=`${now.toDateString()}-${i}-${delta}`; if (notified[id]) return;
    notified[id]=1; sessionStorage.setItem('salah-notified-v1', JSON.stringify(notified));
    const message=delta===0?`${name} time has started now.`:`${name} in ${delta} minute${delta===1?'':'s'}.`;
    playTone(); if ('Notification' in window && Notification.permission==='granted') { const n=new Notification(delta===0?`${name} prayer time`:`Reminder: ${name}`,{body:message,tag:id}); n.onclick=()=>{window.focus();n.close();}; }
    showStatus(message);
  });
}
document.querySelector('#enable').addEventListener('click', async () => {
  if (!saved.every(Boolean)) { showStatus('Save all five prayer times first.'); return; }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) { showStatus('This browser does not support app notifications.'); return; }
  try {
    let OneSignal;
    if (pushConfigured) {
      OneSignal = await initializePush();
      await OneSignal.User.PushSubscription.optIn();
      if (!OneSignal.User.PushSubscription.optedIn) throw new Error('Notifications were not allowed.');
      await sendPushSettings(true);
      try { await recordActivity('background_reminders_enabled'); } catch {}
      showStatus('Background reminders are enabled. Alerts may still follow your device notification and battery settings.');
    } else {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to continue.');
      try { await recordActivity('reminders_enabled'); } catch {}
      showStatus('Reminders work while this page is open. Background delivery is not configured yet.');
    }
    tick();
  } catch (error) { showStatus(error.message || 'Could not enable reminders. Please try again.'); }
});
document.querySelector('#share').addEventListener('click', async () => {
  const data={title:'Salah — a gentle reminder',text:'A gentle reminder for the Ummah. Set your salah times and reminders.',url:location.href};
  try { if(navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); showStatus('App link copied. Send it to someone.'); } } catch {}
});
document.querySelector('#signOut').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace('login.html'); return; }
  currentUser=user;
  try {
    try { done = JSON.parse(localStorage.getItem(doneKey()) || '{}'); } catch { done = {}; }
    const ref=profileRef(user.uid); let snap=await getDoc(ref);
    if(!snap.exists()){await setDoc(ref,{uid:user.uid,name:user.displayName||'',email:user.email||'',prayerTimes:['','','','',''],tone:'gentle',hasInitialTimes:false,editMonthStart:null,editsUsed:0,createdAt:serverTimestamp(),lastActiveAt:serverTimestamp()});snap=await getDoc(ref);}
    profile=snap.data();
    saved=Array.isArray(profile.prayerTimes)&&profile.prayerTimes.length===5?profile.prayerTimes.slice():['','','','',''];
    draft=saved.slice(); nameInput.value=profile.name||''; toneSelect.value=profile.tone||'gentle'; updateGreeting(); draw();
    gate.remove(); document.body.classList.remove('auth-checking');
    try { await recordActivity('page_opened'); await updateDoc(ref,{lastActiveAt:serverTimestamp()}); } catch {}
    if (pushConfigured) initializePush().catch(error => console.warn('Push notifications are not ready yet.', error));
    setInterval(tick,15000);
  } catch (error) {
    gate.textContent='Could not connect to Salah Reminder. Refresh and try again.';
    console.error(error);
  }
});
