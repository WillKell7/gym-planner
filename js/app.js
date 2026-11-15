(function(){
'use strict';

/*SCHED-START*/
var START='2026-11-16';
var FIRST_DAY='2026-11-15'; /* the day you started using the app: nothing earlier is shown */
var SESS={
  push:{name:'Push',kind:'gym',pri:8,def:0,blurb:'Chest, shoulders, triceps'},
  hard:{name:'Hard run',kind:'run',pri:10,def:1,blurb:''},
  pull:{name:'Pull',kind:'gym',pri:7,def:2,blurb:'Back, rear delts, biceps'},
  long:{name:'Long easy run',kind:'run',pri:9,def:5,blurb:'45–60 min at chatting pace'},
  easy:{name:'Easy run',kind:'run',pri:6,def:3,blurb:''},
  legs:{name:'Legs + core',kind:'gym',pri:9,def:5,blurb:'Quads, hamstrings, glutes, calves'},
  arms:{name:'Shoulders & arms',kind:'gym',pri:5,def:6,blurb:'Overhead press, delts, arms'}
};
var ORDER=['hard','legs','long','push','pull','easy','arms'];
function emptyPlan(){var p=[];for(var i=0;i<7;i++)p.push({gym:null,run:null});return p;}
function has(day,s){return day.gym===s||day.run===s;}
function either(A,B,a,b){return (has(A,a)&&has(B,b))||(has(A,b)&&has(B,a));}
/* How much two gym sessions work the same muscles: sets per muscle from the templates, weighted by how directly each exercise hits it (MUSCLE). */
var OVL=null;
function overlap(a,b){
  if(!a||!b)return 0;
  if(!OVL){
    var vol={};OVL={};
    Object.keys(TPL).forEach(function(id){var m={};TPL[id].forEach(function(e){var mm=MUSCLE[e[0]]||{};for(var x in mm)m[x]=(m[x]||0)+e[1]*mm[x];});vol[id]=m;});
    Object.keys(vol).forEach(function(x){OVL[x]={};Object.keys(vol).forEach(function(y){var o=0;for(var k in vol[x])if(vol[y][k])o+=Math.min(vol[x][k],vol[y][k]);OVL[x][y]=o;});});
  }
  return OVL[a]&&OVL[a][b]||0;
}
/* Penalty for day B coming straight after day D (each is {gym,run}). */
var OVL_W=6; /* high enough that a session is left out rather than put straight after one that works the same muscles */
function nextDayPen(D,B){
  var sc=0,dr=D.run,br=B.run;
  if(D.gym==='legs'){if(br==='hard')sc-=40;else if(br==='long')sc-=12;}
  if(dr==='hard'&&B.gym==='legs')sc-=15;
  if(dr&&br){
    if((dr==='hard'&&br==='long')||(dr==='long'&&br==='hard'))sc-=18;
    else if(dr==='easy'||br==='easy')sc-=8;
  }
  /* gym sessions that share muscles (e.g. Shoulders & arms then Push) need a day between */
  if(D.gym&&B.gym)sc-=overlap(D.gym,B.gym)*OVL_W;
  return sc;
}
/* Builds the best week day by day. Each session is worth its priority; clashes (two sessions a day, legs before a hard run,
   gym days that share muscles back to back, no rest day...) cost points. prev is the day before day 0 (last Sunday), so the
   week also fits around what you did then. Days before start, and anything in fixed, stay as they are. */
function schedule(avail,fixed,start,pool,prev){
  var days=fixed.map(function(x){return {gym:x.gym,run:x.run};});
  var placed={};
  days.forEach(function(x){if(x.gym)placed[x.gym]=1;if(x.run)placed[x.run]=1;});
  var free=(pool||ORDER).filter(function(s){return !placed[s];}),used={},left=0;
  var freeG=free.filter(function(s){return SESS[s].kind==='gym';}),freeR=free.filter(function(s){return SESS[s].kind==='run';});
  free.forEach(function(s){left+=SESS[s].pri*20+12;});
  var best=null,bestScore=-Infinity;
  function val(s,d){return SESS[s].pri*20+(SESS[s].def===d?(SESS[s].kind==='run'?12:4):0);}
  function opts(d,k,list){
    if(days[d][k])return [days[d][k]];
    if(d<start||!avail[d][k])return [null];
    var o=list.filter(function(s){return !used[s];});o.push(null);return o;
  }
  function rec(d,sc,streak,rest){
    if(d===7){if(!rest)sc-=10;if(sc>bestScore){bestScore=sc;best=days.map(function(x){return {gym:x.gym,run:x.run};});}return;}
    if(sc+left<=bestScore)return; /* even placing everything left with no clashes can't beat the best so far */
    var fg=days[d].gym,fr=days[d].run,go=opts(d,'gym',freeG),ro=opts(d,'run',freeR);
    var P=d>0?days[d-1]:prev,PP=d>1?days[d-2]:d===1?prev:null;
    for(var i=0;i<go.length;i++)for(var j=0;j<ro.length;j++){
      var g=go[i],r=ro[j],D=days[d],x=0,st=0,nl=left;
      D.gym=g;D.run=r;
      if(g){x+=val(g,d);st=streak+1;if(st>=3)x-=8;if(!fg){used[g]=1;nl-=SESS[g].pri*20+12;}}
      if(r){x+=val(r,d);if(!fr){used[r]=1;nl-=SESS[r].pri*20+12;}}
      if(g&&r){x-=25;if(g==='legs')x-=r==='hard'?60:r==='long'?30:10;}
      if(P)x+=nextDayPen(P,D);
      if(PP&&PP.gym&&g)x-=overlap(PP.gym,g)*0.3;
      var ol=left;left=nl;
      rec(d+1,sc+x,st,rest||(!g&&!r));
      left=ol;
      if(g&&!fg)used[g]=0;if(r&&!fr)used[r]=0;
    }
    days[d].gym=fg;days[d].run=fr;
  }
  rec(0,0,0,false);
  return best;
}
/*SCHED-END*/

var TPL={
  push:[['Incline press',3,8,12],['Bench press',4,8,12],['Dips',3,8,12],['Tricep pushdown',4,10,12],['Lateral raises',3,12,15],['Chest flies',3,10,12]],
  pull:[['Lat pulldown',4,6,10],['Seated row',3,10,12],['Single-arm cable row',3,10,12,' per arm'],['Lateral raises',3,12,15],['Rear delt cable fly',3,12,15],['Bicep curls',3,8,12]],
  legs:[['Squat machine',4,6,10],['Bulgarian split squat',3,8,10,' per leg'],['Hip thrust',3,8,12],['Leg curl',3,10,12],['Leg extension',3,12,12],['Calf raises',3,12,15],['Hanging knee raises',3,10,15]],
  arms:[['Overhead press',3,6,10],['Lateral raises',3,12,15],['Rear delt cable fly',3,12,15],['Pull-ups',3,6,10],['Hammer curls',3,10,12],['Overhead tricep extension',3,10,12]]
};
var TPL_NOTE={
  push:'Incline goes first so the upper chest gets your freshest sets.',
  pull:'Single-arm row: pull your elbow back towards your hip to work the lats. Lateral raises here make it 3 shoulder sessions a week.',
  legs:'Warm up with leg swings and walking lunges. Stretch hamstrings and hip flexors after.',
  arms:'Finish with 5–10 min stretching: hamstrings, hip flexors, calves, glutes, 30–45 s each.'
};
var GYM_IDS=['push','pull','legs','arms'];
var RUN_TYPES=['Intervals','Tempo','Long easy','Easy','Time trial / race'];
var RUN_CLS={'Intervals':'t-int','Tempo':'t-tempo','Long easy':'t-long','Easy':'t-easy','Time trial / race':'t-tt'};
var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad(n){return (n<10?'0':'')+n;}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parse(s){var a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2]);}
function addDays(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);}
function dayIdx(d){return (d.getDay()+6)%7;}
function monday(d){return addDays(d,-dayIdx(d));}
function todayD(){var n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());}
function fmtD(d){return d.getDate()+' '+MONTHS[d.getMonth()];}
function fmtS(s){return fmtD(parse(s));}
function weekIdx(key){return Math.round((parse(key)-parse(START))/864e5/7);}
function blockWeek(key){var i=weekIdx(key);return ((i%12)+12)%12;}
function isDeload(key){return weekIdx(key)>=0&&(blockWeek(key)===5);}
function hardVariant(key){var b=blockWeek(key);if(weekIdx(key)>=0&&(b===11||b===3))return 'trial';return b%2===0?'intervals':'tempo';}
var IV_REPS=[4,0,5,0,5,0,5,0,6,0,6,0],TEMPO_MIN=[0,15,0,20,0,12,0,20,0,25,0,0],LONG_MIN=[40,45,45,50,50,35,50,55,55,60,60,30],EASY_MIN=[25,30,30,30,35,20,35,35,40,40,40,25];
function longInfo(key){var b=blockWeek(key),m=LONG_MIN[b],dl=isDeload(key);return {min:m,desc:m+' min at '+easyPace()+'/km'+(dl?' (lighter week)':''),body:'Run '+m+' min at about '+easyPace()+'/km, easy enough to talk the whole way. Slower than feels necessary: this is the run that brings your heart rate down.'+(dl?' It\u2019s a lighter week, so keep it relaxed.':'')+' Stretch after: hamstrings, hip flexors, calves, glutes.'};}
function easyInfo(key){var b=blockWeek(key),m=EASY_MIN[b],dl=isDeload(key);return {min:m,desc:m+' min at '+easyPace()+'/km'+(dl?' (lighter week)':''),body:'Run '+m+' min at about '+easyPace()+'/km. It should feel easy the whole way: if you couldn\u2019t hold a conversation, slow down. Most of the fitness for a faster 5K comes from easy running like this, and keeping it easy means you\u2019re fresh for the hard run.'+(dl?' Lighter week, so keep it short and relaxed.':'')};}
/* Current 5K fitness: where every run pace comes from. It starts from your estimate in Settings, then follows your runs.
   A time trial or race since then replaces it (faster or slower); any other run that shows you're faster moves it down.
   Intervals don't count. Old evidence drops out: time trials after 12 weeks, other runs after 8. */
var FIT_DEFAULT={sec:1350,date:'2026-11-15'};
function fitness(){
  var f=(state.settings&&state.settings.fit5k)||FIT_DEFAULT,cur={sec:f.sec,src:'your starting estimate',date:f.date,est:true};
  var c84=iso(addDays(todayD(),-84)),c56=iso(addDays(todayD(),-56));
  var runs=state.runs.filter(function(r){return r.km>=3&&r.sec>0&&r.type!=='Intervals'&&r.date>=f.date;}).sort(function(a,b){return a.date<b.date?-1:1;});
  var tts=runs.filter(function(r){return r.type==='Time trial / race'&&r.date>=c84;});
  if(tts.length){var t=tts[tts.length-1];cur={sec:riegel(t.sec,t.km,5),src:'your time trial on '+fmtS(t.date),date:t.date};}
  runs.forEach(function(r){if(r.date>=cur.date&&r.date>=c56){var p=riegel(r.sec,r.km,5);if(p<cur.sec)cur={sec:p,src:'your '+r.type.toLowerCase()+' run on '+fmtS(r.date),date:r.date};}});
  return cur;
}
function fitPace(){return fitness().sec/5;}
function easyPace(){var p=fitPace();return fmtPace(p+80)+'\u2013'+fmtPace(p+110);}
function fitNote(){var f=fitness();return 'Paces come from your current 5K fitness: '+fmtTime(f.sec)+', from '+f.src+'. They update by themselves when you log a time trial or a faster run.';}
function curWeekKey(){return iso(monday(todayD()));}
function defaultWeekKey(){var c=curWeekKey();if(state&&state.weeks&&state.weeks[c])return c;return c<START?START:c;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmtW(w){return w===0?'bodyweight':w<0?(Math.round(-w*10)/10)+'kg assist':(Math.round(w*10)/10)+'kg';}
function fmtSet(s){var w=s.w===0?'BW':s.w<0?(Math.round(-s.w*10)/10)+' assist':(Math.round(s.w*10)/10);return s.r!=null?w+'×'+s.r:String(w)+(s.w>0?'kg':'');}
function fmtSets(sets){return sets.map(fmtSet).join(', ');}
function fmtTime(sec){sec=Math.round(sec);var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?h+':'+pad(m)+':'+pad(s):m+':'+pad(s);}
function fmtPace(spk){return fmtTime(spk);}
function rr(e){return (e[2]===e[3]?e[2]:e[2]+'–'+e[3])+(e[4]||'');}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

/* storage helpers */
var LS={get:function(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}},set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};

function normalize(st){
  if(!st||typeof st!=='object')st={};
  st.v=1;
  ['workouts','runs','weights','checkins','activities'].forEach(function(k){if(!Array.isArray(st[k]))st[k]=[];});
  if(!st.weeks||typeof st.weeks!=='object')st.weeks={};
  if(!st.settings||typeof st.settings!=='object')st.settings={};
  if(!Array.isArray(st.goals))st.goals=[{id:'g1',kind:'run',km:5,sec:1199,base:1350,created:'2026-11-15'},{id:'g2',kind:'lift',ex:'Bench press',w:60,r:8,created:'2026-11-15'},{id:'g3',kind:'lift',ex:'Pull-ups',w:0,r:6,created:'2026-11-15'}];
  st.goals.forEach(function(g){if(g.id==='g1'&&g.kind==='run'&&g.base===1290)g.base=1350;});
  return st;
}
var state=null;
try{state=JSON.parse(document.getElementById('state').textContent);}catch(e){state=null;}
state=normalize(state);

var TABS=['today','plan','log','food','progress','settings'];
var ui={pantryEdit:null,pantryFilter:'all',pantrySearch:'',foodView:'today',foodDay:null,foodWeekOff:0,pantryDraft:null,goalForm:null,tab:'today',fxOpen:null,actType:'walk',actInt:1,ciForm:false,ciAll:false,weekKey:null,logKind:'gym',logSession:null,logDate:null,runType:null,exercise:'Bench press',histAll:false};
(function(){
  var saved=LS.get('tp-ui');
  if(saved&&saved.ts&&Date.now()-saved.ts<2*3600e3){for(var k in ui){if(saved[k]!==undefined)ui[k]=saved[k];}}
  if(!ui.weekKey)ui.weekKey=defaultWeekKey();
  var h=(location.hash||'').slice(1);
  if(TABS.indexOf(h)>=0)ui.tab=h;
})();
function saveUi(){var o={ts:Date.now()};for(var k in ui)o[k]=ui[k];LS.set('tp-ui',o);}

var tempWeeks={};
/* The day before a week starts (its Sunday): a gym session you logged that day wins over the one planned. */
function prevDay(key){
  var pk=iso(addDays(parse(key),-7)),sun=iso(addDays(parse(key),-1)),pw=null;
  if(pk>=curWeekKey()||state.weeks[pk])pw=state.weeks[pk]||getWeek(pk);
  var p=pw?pw.plan[6]:{gym:null,run:null};
  var lg=state.workouts.filter(function(x){return x.date===sun;}).map(function(x){return x.session;}).pop();
  return {gym:lg||p.gym,run:p.run};
}
function daySig(p){return p?(p.gym||'')+'/'+(p.run||''):'';}
function blankWeek(key){
  var avail=[];for(var i=0;i<7;i++)avail.push({gym:true,run:true});
  return {avail:avail,plan:schedule(avail,emptyPlan(),0,null,prevDay(key)),done:{}};
}
function getWeek(key){
  if(state.weeks[key])return state.weeks[key];
  if(!tempWeeks[key])tempWeeks[key]=blankWeek(key);
  return tempWeeks[key];
}
function ensureWeek(key){
  if(!state.weeks[key]){state.weeks[key]=getWeek(key);delete tempWeeks[key];}
  return state.weeks[key];
}
function startIdxFor(key){
  var c=curWeekKey();
  if(key<c)return 7;
  if(key===c)return dayIdx(todayD());
  return 0;
}
function replan(key){
  var w=ensureWeek(key),start=startIdxFor(key);
  if(start>=7)return;
  var fixed=emptyPlan();
  for(var d=0;d<7;d++){
    ['gym','run'].forEach(function(k){
      var s=w.plan[d][k];if(!s)return;
      if(w.done[s]){fixed[d][k]=s;return;}
      if(!w.avail[d][k])return;
      if(d<start)fixed[d][k]=s;
    });
  }
  var pd=prevDay(key);
  w.plan=schedule(w.avail,fixed,start,w.pool,pd);w.prevSig=daySig(pd);
  /* weeks after this one that you haven't touched yet are worked out again, so they fit around its new Sunday */
  Object.keys(tempWeeks).forEach(function(k){if(k>key)delete tempWeeks[k];});
  /* and the next saved week after it, if not started, is re-sorted too (it carries on to the one after) */
  for(var i=1;i<=12;i++){var nk=iso(addDays(parse(key),7*i)),nw=state.weeks[nk];if(!nw)continue;if(!nw.pool&&nk>curWeekKey()&&!Object.keys(nw.done||{}).length)replan(nk);break;}
}
function hasGymK(w){return (w.pool||ORDER).some(function(s){return SESS[s].kind==='gym';});}
function hasRunK(w){return (w.pool||ORDER).some(function(s){return SESS[s].kind==='run';});}
function planList(w){
  var out=[];
  for(var d=0;d<7;d++){if(w.plan[d].gym)out.push({d:d,k:'gym',sid:w.plan[d].gym});if(w.plan[d].run)out.push({d:d,k:'run',sid:w.plan[d].run});}
  return out;
}

/* persistence: per-chunk documents in the artifact database (owner only), live across devices */
var db=null,mode='pending',dbReady=false,saveTimer=null,dirty=false,lastSaved={},flushing=false,pendingRemote=null,loadTimer=null;
var CHUNKS=['core','workouts','runs','weights','foodlog','checkins','activities'];
function clean(o){return JSON.parse(JSON.stringify(o));}
function toChunks(s){
  var f=s.food||{},fc={};
  Object.keys(f).forEach(function(k){if(['ev','marks','preps','extras'].indexOf(k)<0)fc[k]=f[k];});
  return clean({
    core:{v:1,weeks:s.weeks||{},goals:s.goals||[],settings:s.settings||{},food:fc},
    workouts:{list:s.workouts||[]},runs:{list:s.runs||[]},weights:{list:s.weights||[]},
    foodlog:{ev:f.ev||[],marks:f.marks||{},preps:f.preps||[],extras:f.extras||{}},
    checkins:{list:s.checkins||[]},activities:{list:s.activities||[]}
  });
}
function fromChunks(c){
  var s={v:1,weeks:{},goals:[],settings:{},workouts:[],runs:[],weights:[],checkins:[],activities:[],food:{}};
  if(c.core){s.weeks=c.core.weeks||{};s.goals=c.core.goals||[];s.settings=c.core.settings||{};s.food=Object.assign({},c.core.food||{});}
  if(c.workouts)s.workouts=c.workouts.list||[];
  if(c.runs)s.runs=c.runs.list||[];
  if(c.weights)s.weights=c.weights.list||[];
  if(c.checkins)s.checkins=c.checkins.list||[];
  if(c.activities)s.activities=c.activities.list||[];
  if(c.foodlog){s.food.ev=c.foodlog.ev||[];s.food.marks=c.foodlog.marks||{};s.food.preps=c.foodlog.preps||[];s.food.extras=c.foodlog.extras||{};}
  return clean(s);
}
function isEditing(){
  var a=document.activeElement;
  if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return true;
  return ui.tab==='log'&&ui.logKind==='gym'&&hasGymDraft();
}
async function initPersistence(){
  try{if(window.claude&&typeof window.claude.use==='function')db=await window.claude.use('db');}catch(e){db=null;}
  if(!db){
    mode='local';
    var ls=LS.get('tp-state');
    if(ls&&ls.v){state=normalize(ls);tempWeeks={};}
    render();return;
  }
  loadTimer=setTimeout(function(){if(!dbReady){setStatus('slow');render();}},10000);
  db.collection('app').onSnapshot(function(snap){
    var c={};snap.docs.forEach(function(d){c[d.id]=d.data();});
    if(!dbReady){
      if(snap.metadata.fromCache&&snap.empty)return;
      clearTimeout(loadTimer);dbReady=true;mode='db';
      if(snap.empty){/* first sign-in: move anything saved on this device into the account */var ls0=LS.get('tp-state');if(ls0&&ls0.v){state=normalize(ls0);tempWeeks={};}dirty=true;flush();}
      else{
        state=normalize(fromChunks(c));tempWeeks={};
        var ch=toChunks(state);CHUNKS.forEach(function(k){lastSaved[k]=JSON.stringify(ch[k]);});
      }
      render();return;
    }
    if(snap.metadata.hasPendingWrites||dirty||flushing)return;
    var changed=false;
    Object.keys(c).forEach(function(k){var js=JSON.stringify(clean(c[k]));if(lastSaved[k]!==js){changed=true;lastSaved[k]=js;}});
    if(!changed)return;
    var ns=normalize(fromChunks(c));
    if(isEditing()){pendingRemote=ns;setStatus('remote');return;}
    state=ns;tempWeeks={};render();
  },function(err){
    clearTimeout(loadTimer);
    if(!dbReady){mode='local';var ls=LS.get('tp-state');if(ls&&ls.v)state=normalize(ls);render();}
    else{mode='error';setStatus();}
  });
}
function goOffline(){clearTimeout(loadTimer);mode='local';dbReady=false;var ls=LS.get('tp-state');if(ls&&ls.v)state=normalize(ls);tempWeeks={};render();}
function applyRemote(){if(pendingRemote){state=pendingRemote;pendingRemote=null;tempWeeks={};render();}}
function save(){
  dirty=true;saveUi();LS.set('tp-state',state);
  setStatus('saving');
  clearTimeout(saveTimer);saveTimer=setTimeout(flush,500);
}
async function flush(){
  clearTimeout(saveTimer);
  if(!dirty||flushing)return;
  if(mode!=='db'||!db){dirty=false;LS.set('tp-state',state);setStatus();return;}
  flushing=true;dirty=false;
  var ch=toChunks(state);
  for(var i=0;i<CHUNKS.length;i++){
    var k=CHUNKS[i],js=JSON.stringify(ch[k]);
    if(lastSaved[k]===js)continue;
    var ok=false;
    for(var attempt=0;attempt<2&&!ok;attempt++){
      try{await db.doc('app/'+k).set(ch[k]);lastSaved[k]=js;ok=true;}
      catch(e){
        var code=e&&e.code;
        if(code==='unavailable'&&attempt===0){await new Promise(function(r){setTimeout(r,700+Math.random()*600);});continue;}
        if(code==='invalid_argument'){mode='ro';}
        else if(code==='quota_exceeded'){mode='full';}
        else mode='error';
        flushing=false;setStatus();return;
      }
    }
  }
  flushing=false;
  if(dirty){flush();return;}
  setStatus();
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&dirty)flush();});
function setStatus(s){
  var el=document.getElementById('status');if(!el)return;
  var cls='',txt='Saved';
  if(s==='saving'){cls='saving';txt='Saving…';}
  else if(s==='remote'){cls='saving';txt='<button class="linkbtn" data-act="applyremote">Updated on another device: refresh</button>';}
  else if(s==='slow'||(mode==='pending'&&!dbReady&&loadTimer===null)){cls='local';txt='Can’t reach your data yet';}
  else if(mode==='pending'){cls='saving';txt='Loading…';}
  else if(mode==='local'){cls='local';txt='Saved on this device only';}
  else if(mode==='ro'){cls='ro';txt='View only';}
  else if(mode==='full'){cls='local';txt='Storage full. Back up and tidy old logs';}
  else if(mode==='error'){cls='local';txt='Couldn’t save. Check your connection';}
  if((mode==='db'||mode==='local')&&s!=='saving'&&s!=='remote'&&window.Sync&&Sync.problem()){cls='local';txt=Sync.problem();}
  el.className='status '+cls;el.innerHTML='<i></i>'+txt;
}
window.appRefreshStatus=function(){setStatus();if(ui.tab==='settings'&&!isEditing())render();};
var toastTimer=null;
function toast(msg){
  var el=document.getElementById('toast');if(!el)return;
  el.textContent=msg;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('show');},2200);
}

/* ---------- rendering ---------- */
var openDetails={};
/* ---------- gym draft + rest timer ---------- */
function readDraft(){return LS.get('tp-gymdraft');}
function hasGymDraft(){var d=readDraft();return !!(d&&d.vals&&Object.keys(d.vals).some(function(k){return k!=='lg-date'&&d.vals[k]!==''&&d.vals[k]!==false&&d.vals[k]!=null;}));}
function captureDraft(){
  var card=document.querySelector('.gymform');if(!card)return;
  var d={sid:ui.logSession,vals:{},rows:{},ts:Date.now()};
  card.querySelectorAll('input,textarea').forEach(function(el){if(!el.id)return;d.vals[el.id]=el.type==='checkbox'?el.checked:el.value;});
  card.querySelectorAll('.ex').forEach(function(ex){d.rows[ex.getAttribute('data-ex')]=ex.querySelectorAll('.setrow').length;});
  LS.set('tp-gymdraft',d);
}
function restoreDraft(){
  var d=readDraft();if(!d||d.sid!==ui.logSession)return;
  if(Date.now()-d.ts>18*3600e3){LS.set('tp-gymdraft',null);return;}
  Object.keys(d.rows||{}).forEach(function(i){var ex=document.querySelector('.ex[data-ex="'+i+'"]');if(!ex)return;var c=ex.querySelector('.sets');while(c.children.length<d.rows[i])c.insertAdjacentHTML('beforeend',setRow(+i,c.children.length,null));});
  Object.keys(d.vals||{}).forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!d.vals[id];else el.value=d.vals[id];});
  document.querySelectorAll('input[id^="rir-"]').forEach(function(h){var i=h.id.slice(4);document.querySelectorAll('[data-act="rir"][data-ex="'+i+'"]').forEach(function(b){b.classList.toggle('on',h.value!==''&&b.getAttribute('data-v')===h.value);});});
  if(hasGymDraft()){var n=document.getElementById('draftnote');if(n)n.innerHTML='<div class="dlnote draft">Picked up where you left off. <button class="linkbtn" data-act="discarddraft">Start again</button></div>';}
}
var COMPOUND={'Bench press':1,'Incline press':1,'Dips':1,'Lat pulldown':1,'Seated row':1,'Single-arm cable row':1,'Squat machine':1,'Bulgarian split squat':1,'Hip thrust':1,'Overhead press':1,'Pull-ups':1};
var REST={el:null,end:0,iv:null};
function restEl(){
  if(!REST.el){REST.el=document.createElement('div');REST.el.className='rest';REST.el.setAttribute('role','timer');
    REST.el.innerHTML='<span class="rt">Rest <b id="rest-t">0:00</b></span><button data-act="rest" data-v="30">+30s</button><button data-act="rest" data-v="0">Done</button>';
    document.body.appendChild(REST.el);}
  return REST.el;
}
function startRest(sec){restEl();REST.end=Date.now()+sec*1000;REST.el.classList.add('show');REST.el.classList.remove('go');clearInterval(REST.iv);REST.iv=setInterval(tickRest,250);tickRest();}
function stopRest(){if(REST.el){REST.el.classList.remove('show','go');clearInterval(REST.iv);}}
function tickRest(){
  var left=Math.round((REST.end-Date.now())/1000),t=document.getElementById('rest-t');if(!t)return;
  if(left<=0){t.textContent='Go';REST.el.classList.add('go');clearInterval(REST.iv);try{if(navigator.vibrate)navigator.vibrate([200,100,200]);}catch(e){}
    setTimeout(function(){if(REST.end<=Date.now())stopRest();},8000);return;}
  t.textContent=Math.floor(left/60)+':'+pad(left%60);
}
/* ---------- Today ---------- */
var ACTS={walk:{n:'Walk',met:[3,3.5,4.3]},hike:{n:'Hike',met:[5,6,7]},football:{n:'Football / 5-a-side',met:[6,8,10]},cycle:{n:'Bike ride (extra)',met:[5,7,9]},swim:{n:'Swim',met:[5,7,9.5]},sport:{n:'Other sport',met:[4,6,8]},gymx:{n:'Extra gym session',met:[3.5,5,6]},home:{n:'Home workout',met:[3,3.8,5]}};
function actName(a){return a.type==='home'&&a.hs&&HOME[a.hs]?HOME[a.hs].n:(ACTS[a.type]||ACTS.sport).n;}
function actKcal(a){var A=ACTS[a.type]||ACTS.sport,met=a.hs==='mobility'?2.3:A.met[a.int==null?1:a.int];return Math.round((met-1)*bodyKg()*(a.min||0)/60);}
function runKcal(r){return Math.round((r.km||0)*bodyKg()*0.95);}
function extrasOn(ds){
  /* unplanned activity that adds to the day's burn: other activities, runs beyond the planned one, unplanned gym sessions */
  var t=trainOn(ds),out=[];
  (state.activities||[]).forEach(function(a){if(a.date===ds)out.push({n:actName(a)+' '+a.min+' min',k:actKcal(a)});});
  var runs=state.runs.filter(function(r){return r.date===ds;});
  runs.filter(function(r){return r.extra;}).concat(runs.filter(function(r){return !r.extra;}).slice(t.run?1:0)).forEach(function(r){out.push({n:r.type+' run '+r.km+' km',k:runKcal(r)});});
  var gyms=state.workouts.filter(function(w){return w.date===ds;});
  gyms.slice(t.gym?1:0).forEach(function(w){out.push({n:(SESS[w.session]?SESS[w.session].name:'Gym')+' (extra)',k:250});});
  return out;
}
function foodAlertsHTML(sim,F,st){
  var today=iso(todayD()),proj=fProject(7,sim),alerts='',pr=proj.preps[0];
  if(pr&&pr.day<=iso(addDays(todayD(),1))){
    var R=FR[pr.r];
    alerts+='<div class="falert prep"><b>Prep '+(pr.day===today?'today':'tomorrow')+': '+R.n.toLowerCase()+'</b><span>You’re out of freezer lunches from '+DAYS[dayIdx(parse(pr.by))]+'. Makes '+R.makes[1]+', takes about '+R.t+'.</span>'+
      '<div class="mact"><button class="mbtn" data-act="fprepswap">Switch to '+(pr.r==='prep_burrito'?'burrito bowls':'wrapped burritos')+'</button><button class="mbtn on-y" data-act="fprepdone" data-r="'+pr.r+'">✓ Made them</button></div>'+
      '<details data-ok="prep-'+pr.r+'"'+(openDetails['prep-'+pr.r]?' open':'')+'><summary class="linkbtn">Recipe and ingredients</summary><ul class="ing">'+R.ing.map(function(x){return '<li><span>'+FI[x[0]].n+'</span><span class="num">'+fmtQ(x[0],x[1])+'</span></li>';}).join('')+'</ul><ol class="steps">'+R.steps.map(function(s){return '<li>'+s+'</li>';}).join('')+'</ol>'+recipeExtra(R)+'</details></div>';
  }
  var tom=iso(addDays(todayD(),1)),tp=dayPlan(tom),tmk=F.marks[tom]||{},dfr={};
  if(tom>=F.start){
    slotsFor(tp).forEach(function(s){if(tmk[s[0]]&&tmk[s[0]].s!=='y')return;mealIngDay(tom,s[0],tp[s[0]],st).forEach(function(x){if(FI[x[0]].defrost)dfr[x[0]]=(dfr[x[0]]||0)+x[1];});});
  }
  var prepTom=proj.preps.some(function(p){return p.day===tom;});
  proj.preps.forEach(function(p){if(p.day===tom)FR[p.r].ing.forEach(function(x){if(FI[x[0]].defrost)dfr[x[0]]=(dfr[x[0]]||0)+x[1];});});
  var dk=Object.keys(dfr);
  if(dk.length)alerts+='<div class="falert"><b>Before bed: move '+dk.map(function(i){return i==='chicken'?fmtQ(i,dfr[i])+' of chicken':fmtQ(i,dfr[i]);}).join(' and ')+' from the freezer to the fridge</b><span>It’s for tomorrow’s '+(prepTom?'prep and meals':FR[tp.dinner].n.toLowerCase())+'.</span></div>';
  useSoon(sim).forEach(function(u){
    alerts+='<div class="falert warn"><b>'+(u.left<0?'Check the '+FI[u.i].n.toLowerCase()+' is still OK':'Use the '+FI[u.i].n.toLowerCase()+' '+(u.left<=0?'today':u.left===1?'by tomorrow':'in the next 2 days'))+'</b><span>You have '+fmtQ(u.i,sim.st[u.i])+'.'+(FI[u.i].tip?' '+FI[u.i].tip:'')+'</span></div>';
  });
  return alerts?'<div class="falerts">'+alerts+'</div>':'';
}
function renderToday(){
  var F=food(),td=todayD(),ds=iso(td),key=curWeekKey(),w=getWeek(key),d=dayIdx(td),p=w.plan[d],h='';
  var idx=weekIdx(key),variant=hardVariant(key);
  h+='<div class="tday"><div class="tdate">'+['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][d]+' '+fmtD(td)+'</div><div class="sub">'+(w.pool?'Day 1':idx>=0?'Week '+(idx+1)+' of 12':'Before the plan')+(isDeload(key)?' · lighter week':'')+'</div></div>';
  if(d<5){var wf=isWfh(ds);h+='<div class="chips" style="margin:0 0 12px"><button class="pill'+(wf?' on':'')+'" data-act="wfhtoday" aria-pressed="'+wf+'">'+(wf?'Working from home today ✓':'Working from home today?')+'</button><span class="hint" style="margin:0;align-self:center">'+(wf?'No cycle counted, so today’s calorie target is about 200 lower.':'Cycle to work is counted.')+'</span></div>';}
  /* prompts */
  var ws=state.weights.slice().sort(function(a,b){return a.date<b.date?-1:1;}),lw=ws[ws.length-1];
  var pr='';
  if(!lw||(td-parse(lw.date))/864e5>=6)pr+='<button class="prompt" data-act="go" data-tab="log" data-k="bw"><b>Weigh in</b><span>'+(lw?'Last one was '+fmtS(lw.date):'No weigh-ins yet')+'. Once or twice a week keeps your calorie targets accurate.</span></button>';
  var cs=(state.checkins||[]).slice().sort(function(a,b){return a.date<b.date?-1:1;}),lc=cs[cs.length-1];
  if(d===6&&(!lc||(td-parse(lc.date))/864e5>=6))pr+='<button class="prompt" data-act="go" data-tab="progress" data-sec="checkin"><b>Weekly check-in</b><span>Measure your waist, chest and arms, and take a photo if you like. Takes 2 minutes.</span></button>';
  if(pr)h+='<div class="prompts">'+pr+'</div>';
  /* training */
  h+='<h2>Training</h2>';
  var items=[];if(p.run==='hard'){items.push(['run',p.run]);if(p.gym)items.push(['gym',p.gym]);}else{if(p.gym)items.push(['gym',p.gym]);if(p.run)items.push(['run',p.run]);}
  if(items.length)h+='<div class="days"><section class="day">'+items.map(function(it){return sessHTML(key,d,it[0],it[1],w,variant);}).join('')+'</section></div>';
  else h+='<div class="card"><div class="rest">Rest day. Your legs and lungs recover today. 10 minutes of stretching (hamstrings, hip flexors, calves) is a good use of it.</div></div>';
  var ex=extrasOn(ds);
  if(ex.length)h+='<div class="hint" style="margin:8px 0 0">Also today: '+ex.map(function(e){return esc(e.n)+' (~'+e.k+' kcal)';}).join(', ')+'.</div>';
  if(!w.pool||d>=(w.from||0))h+=homeCardHTML(homeFor(ds));
  h+='<div class="tbtns"><button class="btn sm" data-act="go" data-tab="log" data-k="other">+ Log something else</button><button class="btn sm ghost" data-act="go" data-tab="plan">Full week</button></div>';
  /* food */
  h+='<h2>Food</h2>';
  var sim=fSim(),st=sim.st;
  if(ds<F.start){
    h+='<div class="card"><div class="hint" style="margin:0">Your meal plan starts tomorrow. Check the <button class="linkbtn" data-act="go" data-tab="food" data-v="shop">shopping list</button> so you’re ready.</div></div>';
  }else{
    var plan=dayPlan(ds),mk=F.marks[ds]||{},bn=fBurn(ds),tot=dayTotals(ds,plan,mk,st,'today');
    h+='<div class="card">'+nutRow(tot.eatK,tot.eatP,bn.target,protTarget())+'<div class="tmeals">'+slotsFor(plan).map(function(s){
      var rid=plan[s[0]],m=mk[s[0]],stt=m?m.s:'',n=mealNut(rid,st),R=FR[rid];
      var name=rid==='freezer_lunch'?(lunchPick(st)==='bowl'?'Burrito bowl and an apple':'Freezer burrito and an apple'):R.n;
      if(s[0]==='dinner'&&(F.swaps||{})[ds])name=FR[F.swaps[ds]].n;
      return '<div class="tmeal'+(stt==='x'||stt==='o'?' skipped':stt==='y'?' eaten':'')+'"><div class="tm-main"><span class="mslot">'+s[1]+'</span><span class="tm-name">'+esc(stt==='o'?'Ate something else ('+m.k+' kcal)':name)+'</span></div>'+
        '<button class="tm-b'+(stt==='y'?' on-y':'')+'" data-act="fmark" data-d="'+ds+'" data-s="'+s[0]+'" data-v="y" aria-label="Had '+esc(s[1])+'">✓</button><button class="tm-b'+(stt==='x'?' on-x':'')+'" data-act="fmark" data-d="'+ds+'" data-s="'+s[0]+'" data-v="x" aria-label="Skipped '+esc(s[1])+'">✕</button></div>';
    }).join('')+'</div><button class="linkbtn" data-act="go" data-tab="food" data-v="today">Recipes, swaps and more</button></div>';
  }
  h+=foodAlertsHTML(sim,F,st);
  /* goals */
  var act=state.goals.filter(function(g){return !(g.kind==='run'?runStatus(g).achieved:liftStatus(g).achieved);}).slice(0,3);
  if(act.length){
    h+='<h2>Goals</h2><div class="card">'+act.map(function(g){var stt=g.kind==='run'?runStatus(g):liftStatus(g);var eta=etaText(stt.eta);
      return '<div class="tgoal"><div class="tg-row"><span>'+esc(goalTitle(g))+'</span><span class="num">'+(eta?eta:Math.round(stt.progress*100)+'%')+'</span></div><div class="gbar'+(g.kind==='run'?' run':'')+'"><span style="width:'+Math.round(stt.progress*100)+'%"></span></div></div>';}).join('')+'</div>';
  }
  return h;
}

/* ---------- muscle volume ---------- */
var MUSCLE={'Incline press':{'Chest':1,'Front delts':.5,'Triceps':.5},'Bench press':{'Chest':1,'Triceps':.5,'Front delts':.5},'Dips':{'Triceps':1,'Chest':.5},'Tricep pushdown':{'Triceps':1},'Overhead tricep extension':{'Triceps':1},'Lateral raises':{'Side delts':1},'Chest flies':{'Chest':1},'Lat pulldown':{'Back':1,'Biceps':.5},'Pull-ups':{'Back':1,'Biceps':.5},'Seated row':{'Back':1,'Biceps':.5,'Rear delts':.5},'Single-arm cable row':{'Back':1,'Biceps':.5},'Rear delt cable fly':{'Rear delts':1},'Bicep curls':{'Biceps':1},'Hammer curls':{'Biceps':1},'Squat machine':{'Quads':1,'Glutes':.5},'Bulgarian split squat':{'Quads':1,'Glutes':1},'Hip thrust':{'Glutes':1},'Leg curl':{'Hamstrings':1},'Leg extension':{'Quads':1},'Calf raises':{'Calves':1},'Hanging knee raises':{'Abs':1},'Overhead press':{'Front delts':1,'Side delts':.5,'Triceps':.5}};
var MORDER=['Side delts','Back','Chest','Biceps','Triceps','Rear delts','Front delts','Quads','Glutes','Hamstrings','Calves','Abs'];
var PRIORITY={'Side delts':1,'Back':1,'Chest':1,'Biceps':1,'Triceps':1};
function weekVolume(key){
  var w=getWeek(key),plan={},done={},k1=iso(addDays(parse(key),6)),dl=isDeload(key);
  w.plan.forEach(function(p){if(p.gym&&TPL[p.gym])TPL[p.gym].forEach(function(e){var m=MUSCLE[e[0]]||{},n=dl?Math.max(1,e[1]-1):e[1];for(var x in m)plan[x]=(plan[x]||0)+m[x]*n;});});
  state.workouts.forEach(function(wo){if(wo.date<key||wo.date>k1)return;wo.exercises.forEach(function(e){var m=MUSCLE[e.name]||{},n=e.sets.filter(function(x){return x.r>0;}).length;for(var x in m)done[x]=(done[x]||0)+m[x]*n;});});
  (state.activities||[]).forEach(function(a){if(a.date<key||a.date>k1||a.type!=='home'||!HOME[a.hs])return;var hv=HOME[a.hs].vol;for(var x in hv)done[x]=(done[x]||0)+hv[x];});
  return {plan:plan,done:done};
}
function half(x){return String(Math.round(x*2)/2);}
function volumeHTML(){
  var key=curWeekKey(),v=weekVolume(key),max=20;
  MORDER.forEach(function(m){max=Math.max(max,v.plan[m]||0,v.done[m]||0);});
  var rows=MORDER.filter(function(m){return v.plan[m]||v.done[m];}).map(function(m){
    var p=v.plan[m]||0,d=v.done[m]||0;
    return '<div class="vrow'+(PRIORITY[m]?' pri':'')+'"><span class="vname">'+m+'</span><span class="vbar"><span class="vplan" style="width:'+(p/max*100)+'%"></span><span class="vdone" style="width:'+(d/max*100)+'%"></span><span class="vten" style="left:'+(10/max*100)+'%"></span></span><span class="num">'+half(d)+' / '+half(p)+'</span></div>';
  }).join('');
  return '<h2>Sets per muscle this week</h2><div class="card">'+(rows||'<div class="empty">No gym sessions planned this week.</div>')+
    '<div class="legend"><span><i style="background:var(--gym)"></i>Done</span><span><i style="background:var(--gym-soft)"></i>Planned</span><span><i style="background:var(--ink);width:2px"></i>10 sets</span></div>'+
    '<div class="hint" style="margin:6px 0 0">Growth keeps improving up to around 10 hard sets per muscle per week, then more slowly beyond that (Pelland et al., 2024). Bold rows are the muscles you want to bring up. Indirect work, like biceps on rows, counts as half a set. Home workouts you tick off count too.'+(isDeload(key)?' This is a lighter week, so fewer sets are planned.':'')+'</div></div>';
}


/* ---------- optional home workouts (bands/cables, pull-up bar, bodyweight) ---------- */
var HOME={
  pullup:{n:'Pull-up practice',min:15,base:6,heavy:true,main:['Back'],vol:{'Back':7,'Biceps':3.5},
    why:'Extra pull-up practice is the quickest route to your pull-up goal, and it widens your back.',
    ex:[['Pull-ups','4 sets','Stop 1\u20132 reps before failure and rest 2 min. Can\u2019t do 3 yet? Do 5 slow negatives instead: jump or step up to the top, then lower yourself over 4\u20135 seconds.'],
        ['Band straight-arm pulldown','3 \u00d7 12\u201315','Loop the band over the bar. Keep your arms straight and pull your hands down to your thighs. You should feel it in your lats, not your arms.'],
        ['Dead hang','2 \u00d7 20\u201340 s','Hang from the bar with your shoulders pulled down. Builds grip for the pull-ups.']]},
  pushups:{n:'Push-ups for upper chest',min:15,base:6,heavy:true,main:['Chest'],vol:{'Chest':6,'Triceps':2,'Front delts':2},
    why:'Upper chest is one of your priority areas, and feet-elevated push-ups hit it well.',
    ex:[['Feet-elevated push-ups','3 sets','Feet on the sofa or a chair; the higher your feet, the more upper chest. Hands just wider than your shoulders, elbows about 45\u00b0 from your body. Stop 2 reps before failure.'],
        ['Band chest fly','2 \u00d7 12\u201315','Anchor the band behind you at chest height (round the pull-up bar or a door anchor). Soft elbows, bring your hands together in front of you.'],
        ['Push-ups','1 set','Normal push-ups, stopping 1 rep before failure.']]},
  delts:{n:'Side delts & arms (bands)',min:15,base:6,heavy:true,main:['Side delts'],vol:{'Side delts':3,'Rear delts':2,'Biceps':2,'Triceps':2},
    why:'Side delts make your shoulders look wider, the biggest part of a V-taper, and they recover quickly.',
    ex:[['Band lateral raise','3 \u00d7 15\u201320','Stand on the band and raise your arms out to the side to shoulder height, leading with your elbows. Lower slowly.'],
        ['Band face pull','2 \u00d7 15\u201320','Anchor at head height. Pull towards your face with your elbows high, finishing with your hands either side of your head.'],
        ['Band curl','2 \u00d7 12\u201315','Stand on the band with your elbows pinned to your sides.'],
        ['Band overhead triceps extension','2 \u00d7 12\u201315','Stand on the band or anchor it low behind you. Hands behind your head, then straighten your arms overhead.']]},
  core:{n:'Core',min:10,base:4,main:['Abs'],vol:{'Abs':7},
    why:'Core work barely tires you, and a strong trunk helps you hold your form late in a run.',
    ex:[['Hanging knee raises','3 \u00d7 8\u201315','From the pull-up bar. Curl your pelvis up rather than just lifting your knees, and don\u2019t swing.'],
        ['Band Pallof press','2 \u00d7 10 per side','Anchor the band at chest height to your side. Hold it at your chest and press straight out without letting it twist you.'],
        ['Side plank','2 \u00d7 30\u201345 s per side','Straight line from head to feet, hips up.']]},
  mobility:{n:'Stretch & mobility',min:12,base:2,main:[],vol:{},
    why:'Hamstrings are your tightest area. Flexibility gains level off at about 10 minutes of stretching per muscle a week (Warneke et al., 2024), so a few of these a week is enough.',
    ex:[['Lying hamstring stretch','2 \u00d7 45 s per leg','Lie on your back, loop a band round one foot and pull the straight leg up until you feel a stretch. Breathe out and let it ease further.'],
        ['Half-kneeling hip flexor stretch','2 \u00d7 45 s per side','Squeeze the glute of your back leg and shift your hips forward slightly.'],
        ['Calf stretch against a wall','45 s per leg','Back heel down, back knee straight.'],
        ['Figure-4 glute stretch','45 s per side','On your back, ankle on the opposite knee, then pull the bottom leg towards you.'],
        ['Open book','8 per side','On your side with knees bent, rotate your top arm open towards the floor behind you. Loosens your upper back after a day at a desk.']]}
};
function gymMain(ds){var t=trainOn(ds),m={};if(t.gym&&TPL[t.gym])TPL[t.gym].forEach(function(e){var mm=MUSCLE[e[0]]||{};for(var x in mm)if(mm[x]>=1)m[x]=1;});return m;}
function homeWeek(key,inner){
  var mon=parse(key),vol=weekVolume(key).plan,picks=[],cnt={},strength=0,dl=isDeload(key),prev=inner?null:homeWeek(iso(addDays(mon,-7)),true)[6].hs;
  var goalPU=state.goals.some(function(g){return g.kind==='lift'&&/pull-?up|chin/i.test(g.ex)&&!liftStatus(g).achieved;});
  var goalCh=state.goals.some(function(g){return g.kind==='lift'&&/bench|incline|push-?up|press-?up|dip/i.test(g.ex)&&!liftStatus(g).achieved;});
  for(var d=0;d<7;d++){
    var ds=iso(addDays(mon,d)),t=trainOn(ds),blk=Object.assign({},gymMain(iso(addDays(mon,d-1))),gymMain(ds),gymMain(iso(addDays(mon,d+1))));
    if(prev)HOME[prev].main.forEach(function(m){blk[m]=1;});
    var w0=getWeek(key);if(w0.pool&&d<(w0.from||0)){picks.push({hs:'mobility',ds:ds,two:false,dl:dl,run:null,gym:null});prev=null;continue;}
    var tdy=gymMain(ds),two=!!(t.gym&&t.run),best='mobility',bs=-99;
    Object.keys(HOME).forEach(function(k){
      var H=HOME[k];
      if(H.main.some(function(m){return blk[m];}))return;
      if(Object.keys(H.vol).some(function(m){return H.vol[m]>=2&&tdy[m];}))return;
      if(k!=='mobility'&&(two||(dl&&k!=='core')))return;
      if(H.heavy&&strength>=3)return;
      var sc=H.base;
      H.main.forEach(function(m){if(PRIORITY[m])sc+=Math.max(0,14-(vol[m]||0))*0.5;});
      if(k==='pullup'&&goalPU)sc+=4;
      if(k==='pushups'&&goalCh)sc+=2;
      if(k==='mobility'&&t.run)sc+=3;
      if(k!=='mobility')sc-=5*(cnt[k]||0);
      if(sc>bs){bs=sc;best=k;}
    });
    cnt[best]=(cnt[best]||0)+1;if(HOME[best].heavy)strength++;
    picks.push({hs:best,ds:ds,two:two,dl:dl,run:t.run,gym:t.gym});
    prev=best;
  }
  return picks;
}
function homeFor(ds){var p=homeWeek(iso(monday(parse(ds))));return p[dayIdx(parse(ds))];}
function homeWhy(p){
  var H=HOME[p.hs],r=H.why;
  if(p.two)return 'You already have two sessions today, so only stretching if anything. '+r;
  if(p.dl&&p.hs==='mobility')return 'Lighter week, so keep extras easy. '+r;
  if(H.main.length)r+=' Your '+H.main[0].toLowerCase()+' isn\u2019t trained yesterday, today or tomorrow, so it won\u2019t eat into your gym sessions.';
  else if(p.run)r+=' A good way to finish a run day.';
  return r;
}
function homeExList(H){return '<ol class="hex">'+H.ex.map(function(e){return '<li><div class="hx-row"><b>'+e[0]+'</b><span class="num">'+e[1]+'</span></div><span>'+e[2]+'</span></li>';}).join('')+'</ol>';}
function homeDone(ds,hs){return (state.activities||[]).filter(function(a){return a.date===ds&&a.type==='home'&&a.hs===hs;})[0];}
function homeCardHTML(p){
  var H=HOME[p.hs],dn=homeDone(p.ds,p.hs);
  var h='<div class="card home'+(dn?' done':'')+'"><div class="hm-head"><div><span class="mslot">Optional at home \u00b7 '+H.min+' min</span><div class="hm-name">'+H.n+'</div></div>'+
    '<button class="mbtn'+(dn?' on-y':'')+'" data-act="homedone" data-d="'+p.ds+'" data-h="'+p.hs+'">'+(dn?'Done \u2713':'\u2713 Did it')+'</button></div>'+
    '<p class="hint" style="margin:6px 0 0">'+homeWhy(p)+'</p>'+
    '<details data-ok="home-'+p.ds+'"'+(openDetails['home-'+p.ds]?' open':'')+'><summary class="linkbtn">Exercises</summary>'+homeExList(H)+'</details>';
  if(p.hs!=='mobility'){
    var M=HOME.mobility,dm=homeDone(p.ds,'mobility');
    h+='<details data-ok="homem-'+p.ds+'"'+(openDetails['homem-'+p.ds]||dm?' open':'')+'><summary class="linkbtn">Or just stretch ('+M.min+' min)</summary>'+homeExList(M)+
      '<button class="mbtn'+(dm?' on-y':'')+'" data-act="homedone" data-d="'+p.ds+'" data-h="mobility">'+(dm?'Done \u2713':'\u2713 Did the stretches')+'</button></details>';
  }
  return h+'</div>';
}

/* ---------- check-ins ---------- */
var assetsNS=null,downloadsNS=null,RESTORE=null;
(function(){try{if(window.claude&&claude.use){claude.use('assets').then(function(a){assetsNS=a;if(a&&ui.tab==='progress'&&!isEditing())render();}).catch(function(){});claude.use('downloads').then(function(d){downloadsNS=d;if(d&&ui.tab==='settings')render();}).catch(function(){});}}catch(e){}})();
function ciVal(c,k){return c&&c[k]?c[k]:null;}
function checkinHTML(){
  var cs=(state.checkins||[]).slice().sort(function(a,b){return a.date<b.date?1:-1;}),h='<h2 id="sec-checkin">Weekly check-in</h2><div class="card">';
  if(ui.ciForm){
    h+='<div class="row2"><label>Date<input type="date" min="'+FIRST_DAY+'" id="ci-date" value="'+iso(todayD())+'"></label><label>Waist (cm)<input id="ci-waist" type="number" inputmode="decimal" step="0.1" min="0"></label></div>'+
      '<div class="row3"><label>Chest (cm)<input id="ci-chest" type="number" inputmode="decimal" step="0.1" min="0"></label><label>Arm (cm)<input id="ci-arm" type="number" inputmode="decimal" step="0.1" min="0"></label><label>Thigh (cm)<input id="ci-thigh" type="number" inputmode="decimal" step="0.1" min="0"></label></div>'+
      (assetsNS?'<label>Photo (optional, only you can see it)<input type="file" id="ci-photo" accept="image/*"></label>':'')+
      '<label>Notes<textarea id="ci-note" rows="2" placeholder="Energy, sleep, how clothes fit"></textarea></label>'+
      '<p class="hint" style="margin:0">Measure first thing in the morning, relaxed: waist level with your belly button, chest across the nipples, arm flexed at its widest, thigh at its widest. Fill in whichever you like.</p>'+
      '<div class="err" id="ci-err"></div><div class="row2"><button class="btn" data-act="cicancel">Cancel</button><button class="btn primary" data-act="cisave">Save check-in</button></div>';
  }else h+='<button class="btn" data-act="ciopen">+ New check-in</button>';
  if(cs.length){
    var first=cs[cs.length-1];
    var cell=function(c,k){var v=ciVal(c,k),f=ciVal(first,k);if(v==null)return '<td>–</td>';var dd=c!==first&&f!=null?Math.round((v-f)*10)/10:null;return '<td>'+v+(dd?'<small class="'+(k==='waist'?(dd>0?'up':'down'):(dd>0?'down':'up'))+'">'+(dd>0?'+':'')+dd+'</small>':'')+'</td>';};
    h+='<table class="sets-table ci"><thead><tr><th></th><th>Waist</th><th>Chest</th><th>Arm</th><th>Thigh</th><th></th></tr></thead><tbody>'+cs.slice(0,ui.ciAll?99:6).map(function(c){
      return '<tr><td>'+fmtS(c.date)+'</td>'+cell(c,'waist')+cell(c,'chest')+cell(c,'arm')+cell(c,'thigh')+'<td><button class="del" data-act="del" data-type="checkins" data-id="'+esc(c.id)+'">Delete</button></td></tr>';}).join('')+'</tbody></table>';
    if(cs.length>6)h+='<button class="linkbtn" data-act="ciall">'+(ui.ciAll?'Show fewer':'Show all '+cs.length)+'</button>';
    var ph=cs.filter(function(c){return c.photo;});
    if(ph.length)h+='<div class="photos">'+ph.slice(0,8).map(function(c){return '<figure><img data-photo="'+esc(c.photo)+'" alt="Check-in photo '+fmtS(c.date)+'" loading="lazy"><figcaption>'+fmtS(c.date)+'</figcaption></figure>';}).join('')+'</div>';
    h+='<p class="hint" style="margin:8px 0 0">Changes are against your first check-in. Arms and chest going up while your waist holds steady means the weight you’re gaining is mostly muscle.</p>';
  }
  return h+'</div>';
}
function shrinkImage(file){
  return new Promise(function(res,rej){
    var img=new Image(),url=URL.createObjectURL(file);
    img.onload=function(){var m=1280,sc=Math.min(1,m/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(function(b){b?res(b):rej(new Error('encode'));},'image/jpeg',0.85);};
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('load'));};img.src=url;
  });
}

/* ---------- settings and backup ---------- */
function renderSettings(){
  var S=sett(),F=food(),kg=bodyKg(),FS=state.settings.fit5k||FIT_DEFAULT,FF=fitness(),h='<h2>Settings</h2><div class="card">';
  h+='<div class="row3"><label>Height (cm)<input id="st-h" type="number" inputmode="decimal" step="0.1" value="'+S.height+'"></label><label>Age<input id="st-age" type="number" inputmode="numeric" value="'+S.age+'"></label><label>Protein a day (g)<input id="st-p" type="number" inputmode="numeric" value="'+S.protein+'"></label></div>'+
    '<p class="hint" style="margin:0">Research supports 1.6–2.2g of protein per kg for building muscle: '+Math.round(kg*1.6)+'–'+Math.round(kg*2.2)+'g at your current weight (Morton et al., 2018).</p>'+
    '<div class="lbl2">Days you usually work from home</div><div class="chips">'+['Mon','Tue','Wed','Thu','Fri'].map(function(n,i){return '<button class="pill'+(S.wfh[i]?' on':'')+'" data-act="stwfh" data-i="'+i+'" aria-pressed="'+!!S.wfh[i]+'">'+n+'</button>';}).join('')+'</div>'+
    '<p class="hint" style="margin:0">On these days there’s no cycle to work, so the calorie target drops by about 200. If a week is different, use the button on the Today page for that day.</p>'+
    '<div class="lbl2">Your 5K right now</div><div class="row2"><label>Minutes<input id="st-fm" type="number" inputmode="numeric" min="12" max="45" value="'+Math.floor(FS.sec/60)+'"></label><label>Seconds<input id="st-fs" type="number" inputmode="numeric" min="0" max="59" value="'+Math.round(FS.sec%60)+'"></label></div>'+
    '<p class="hint" style="margin:0">Your best guess at an all-out 5K today. Every run pace is set from it. The app now uses <b>'+fmtTime(FF.sec)+'</b> (from '+FF.src+'). Time trials and faster runs update it by themselves, so you only need this if it feels wrong.</p>'+
    '<div class="err" id="st-err"></div><button class="btn primary" data-act="stsave">Save settings</button></div>';
  h+='<h2>Calorie auto-adjust</h2><div class="card"><p class="hint" style="margin:0">Every 2 weeks the app checks your weigh-ins from the last 3–5 weeks. If you’re gaining under 0.25kg a month it adds 150 kcal a day; over 1kg a month it takes 150 off. Rice, pasta, oats and bread portions scale to match.</p>'+
    '<div class="kv"><span>Current adjustment</span><b>'+(F.adj?(F.adj>0?'+':'')+F.adj+' kcal a day':'None yet')+'</b></div>'+
    ((F.adjLog||[]).length?'<ul class="adjlog">'+F.adjLog.slice(-5).reverse().map(function(l){return '<li><b>'+fmtS(l.d)+'</b> '+(l.delta>0?'+':'')+l.delta+' kcal. '+esc(l.why)+'</li>';}).join('')+'</ul>':'')+
    (F.adj?'<button class="btn sm" data-act="stadjreset">Reset to no adjustment</button>':'')+'</div>';
  h+='<h2>Backup</h2><div class="card"><p class="hint" style="margin:0">Your data saves to your account automatically and syncs to your other devices. A backup is a spare copy to keep yourself.</p>'+
    '<div class="row2">'+(downloadsNS?'<button class="btn" data-act="bkdl">Download backup</button>':'')+'<button class="btn" data-act="bkcopy">Copy backup</button></div>'+
    '<label>Restore from a backup file<input type="file" id="bk-file" accept=".json,application/json"></label><div id="bk-msg">'+(RESTORE?restoreSummary():'')+'</div></div>';
  if(window.Strava)h+=Strava.html();
  if(window.Sync)h+=Sync.accountHtml();
  return h;
}
function backupText(){return JSON.stringify({app:'sub20-plan',exported:new Date().toISOString(),state:state});}
function restoreSummary(){var r=RESTORE;return '<div class="notice">Backup from <b>'+esc(r.when)+'</b>: '+r.st.workouts.length+' workouts, '+r.st.runs.length+' runs, '+r.st.weights.length+' weigh-ins. This replaces everything in the app now.<div class="row2" style="margin-top:8px"><button class="btn" data-act="bkcancel">Cancel</button><button class="btn primary" data-act="bkrestore">Replace my data</button></div></div>';}

/* Plan version 2 added a third run (easy, Thursday by default). Weeks already planned are re-planned once, keeping anything ticked off and days already gone. */
function upgradePlan(){
  if((state.settings.planV||1)>=2)return false;
  var c=curWeekKey();
  Object.keys(state.weeks).forEach(function(k){var w=state.weeks[k];if(k>=c&&!w.pool&&!planList(w).some(function(x){return x.sid==='easy';}))replan(k);});
  state.settings.planV=2;return true;
}
/* A saved week that hasn't started yet is re-sorted whenever the Sunday before it changes
   (a different session planned or logged there), so it never opens with a session that works the same muscles. */
function refitWeeks(){
  var c=curWeekKey(),ch=false;
  Object.keys(state.weeks).sort().forEach(function(k){
    var w=state.weeks[k];
    if(k<=c||w.pool||Object.keys(w.done||{}).length)return;
    if(w.prevSig!==daySig(prevDay(k))){replan(k);ch=true;}
  });
  return ch;
}
function render(){
  if(mode!=='pending'&&(upgradePlan()|refitWeeks()|stravaImport()|autoAdjust()))save();
  var root=document.getElementById('root');
  var body=ui.tab==='today'?renderToday():ui.tab==='plan'?renderPlan():ui.tab==='log'?renderLog():ui.tab==='food'?renderFood():ui.tab==='settings'?renderSettings():renderProgress();
  root.innerHTML='<header class="top"><div class="top-inner"><div class="brand"><h1>Sub-<span>20</span> Plan</h1><div class="brand-r"><div id="status" class="status"><i></i>Saved</div><button class="gear" data-act="tab" data-tab="settings" aria-label="Settings and backup" aria-pressed="'+(ui.tab==='settings')+'"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></div></div>'+
    '<nav class="tabs" role="tablist">'+[['today','Today'],['plan','Training'],['log','Log'],['food','Food'],['progress','Progress']].map(function(t){return '<button role="tab" data-act="tab" data-tab="'+t[0]+'" aria-selected="'+(ui.tab===t[0])+'">'+t[1]+'</button>';}).join('')+'</nav></div></header>'+
    '<main class="wrap">'+body+'</main><div id="toast" class="toast" role="status" aria-live="polite"></div>';
  setStatus(dirty?'saving':undefined);
  if(ui.tab==='log'&&ui.logKind==='gym')restoreDraft();
}

function hardInfo(variant,key){
  key=key||ui.weekKey;var b=blockWeek(key),nr=IV_REPS[b]||5,tm=TEMPO_MIN[b]||20,dl=isDeload(key);
  var p=fitPace(),g=activeRunGoal(),tk=g&&g.km<=10?g.km:5,fn=' '+fitNote();
  var iv=fmtPace(p-3)+'\u2013'+fmtPace(p+2),tp=fmtPace(p+22)+'\u2013'+fmtPace(p+28);
  if(variant==='intervals')return {title:'Intervals',reps:nr,desc:nr+' \u00d7 1 km at '+iv+'/km',body:'Warm up 10 min easy. Run '+nr+' \u00d7 1 km at '+iv+'/km with a 2 min jog between reps. Cool down 10 min. That\u2019s about your current 5K race pace: it should feel hard but controlled, and the last rep should be as fast as the first. The number of reps builds over the 12-week block.'+fn,type:'Intervals'};
  if(variant==='tempo')return {title:'Tempo run',min:tm,desc:tm+' min at '+tp+'/km'+(dl?' (lighter week)':''),body:'Warm up 10 min easy. Run '+tm+' min at '+tp+'/km. It should feel comfortably hard: you can say a few words, but you couldn\u2019t chat. Cool down 10 min.'+(dl?' Lighter week: shorter than usual so you recover.':' It gets longer over the 12-week block.')+fn,type:'Tempo'};
  return {title:'Time trial',desc:'Flat-out '+fmtKm(tk)+' to see where you are',body:'Warm up 15 min with a few short strides. Run '+fmtKm(tk)+' at your best effort on a flat route. Log it as a time trial: it resets the paces for your other runs and counts towards your goal. Your current estimate is '+fmtTime(fitness().sec)+' for 5K, so start at about '+fmtPace(p)+'/km and speed up over the last kilometre if you can.',type:'Time trial / race'};
}
function sessHTML(key,d,k,sid,w,variant,lockDone){
  var S=SESS[sid],isDone=!!w.done[sid],title=S.name,desc=S.blurb,body='';
  if(sid==='hard'){var h=hardInfo(variant,key);title=h.title;desc=h.desc;body='<div class="sbody">'+h.body+'</div>';}
  else if(sid==='long'){var li=longInfo(key);desc=li.desc;body='<div class="sbody">'+li.body+'</div>';}
  else if(sid==='easy'){var ei=easyInfo(key);desc=ei.desc;body='<div class="sbody">'+ei.body+'</div>';}
  else{
    var anyT=false;
    body=(isDeload(key)?'<div class="dlnote">Lighter week: one set fewer per exercise, same weights, and stop 3\u20134 reps short of failure. It lets your body catch up so you come back stronger.</div>':'')+'<ol class="exlist">'+TPL[sid].map(function(e){var sg=suggest(e,key);if(sg.sets)anyT=true;return '<li><span>'+e[0]+'</span><span class="num">'+(sg.sets?'<b class="tgt-'+sg.kind+'">'+fmtTarget(sg.sets)+'</b>':e[1]+' × '+rr(e))+'</span></li>';}).join('')+'</ol>';
    body+='<div class="sbody">'+(anyT?'Targets come from your last session and update every time you log.':'First time through: find your starting weights. Targets appear from next time.')+'</div>';
    if(TPL_NOTE[sid])body+='<div class="sbody">'+TPL_NOTE[sid]+'</div>';
    if(!desc)desc=TPL[sid].length+' exercises';
    else desc+=' · '+TPL[sid].length+' exercises';
  }
  var ok=key+'-'+sid;
  return '<div class="sess '+k+(isDone?' done':'')+'">'+
    '<details data-ok="'+ok+'"'+(openDetails[ok]?' open':'')+'><summary><span class="stitle">'+title+'</span><span class="sdesc">'+desc+'</span></summary>'+body+'</details>'+
    '<div class="sess-actions"><button class="btn sm ghost" data-act="logit" data-sid="'+sid+'" data-d="'+d+'">Log</button>'+
    '<button class="chk" data-act="done" data-sid="'+sid+'" aria-pressed="'+isDone+'" aria-label="Mark '+esc(title)+' done">✓</button></div></div>';
}
function renderPlan(){
  if(ui.weekKey<iso(monday(parse(FIRST_DAY))))ui.weekKey=iso(monday(parse(FIRST_DAY)));
  var key=ui.weekKey,w=getWeek(key),mon=parse(key),cur=curWeekKey();
  var isPast=key<cur,isCur=key===cur,tIdx=isCur?dayIdx(todayD()):-1;
  var idx=weekIdx(key),variant=hardVariant(key);
  var all=planList(w),doneN=all.filter(function(x){return w.done[x.sid];}).length;
  var pool=w.pool||ORDER,from=w.from||0;
  var unplaced=pool.filter(function(s){return !all.some(function(x){return x.sid===s;});});
  var hasGym=pool.some(function(s){return SESS[s].kind==='gym';}),hasRun=pool.some(function(s){return SESS[s].kind==='run';});
  var blocked=w.avail.some(function(a,i){return i>=(w.from||0)&&((!a.gym&&hasGymK(w))||(!a.run&&hasRunK(w)));});
  var vLabel=variant==='intervals'?'Intervals week':variant==='tempo'?'Tempo week':'Time trial week';
  var label=w.pool?'Day 1':idx>=0?'Week '+(idx+1):'Before the plan';
  if(w.pool&&pool.indexOf('hard')<0)vLabel='Your first session';
  var firstWk=key<=iso(monday(parse(FIRST_DAY))),shownFrom=iso(mon)<FIRST_DAY?parse(FIRST_DAY):mon;
  var h='<div class="weeknav"><button class="iconbtn" data-act="wk" data-n="-1" aria-label="Previous week"'+(firstWk?' disabled':'')+'>‹</button>'+
    '<div class="wk"><div class="range">'+(+shownFrom===+addDays(mon,6)?fmtD(shownFrom):fmtD(shownFrom)+' – '+fmtD(addDays(mon,6)))+'</div><div class="sub">'+label+' · '+vLabel+(isCur?' · This week':'')+'</div></div>'+
    '<button class="iconbtn" data-act="wk" data-n="1" aria-label="Next week">›</button></div>';
  h+='<div class="summary"><span class="pill strong">'+doneN+' of '+all.length+' done</span>';
  if(key!==defaultWeekKey())h+='<button class="pill" data-act="wk-now">Back to current week</button>';
  if(blocked&&!isPast)h+='<button class="pill" data-act="resetwk">Unblock all days</button>';
  h+='</div>';
  h+='<p class="hint">'+(w.pool&&!isPast?'Day 1. Your first session is today, and the full plan starts tomorrow.':isPast?'This week has passed. You can still tick sessions off.':'Tap Gym or Run on any day you can’t do it and the week rearranges itself.'+(isCur?' Days already gone stay put. If you missed one, block it and the session moves later in the week.':''))+'</p>';
  if(unplaced.length){
    var names=unplaced.map(function(s){return s==='hard'?hardInfo(variant).title:SESS[s].name;});
    h+='<div class="notice">Couldn’t fit <b>'+names.join('</b>, <b>')+'</b> this week. Free up a day to get '+(names.length>1?'them':'it')+' back.</div>';
  }
  h+='<div class="days">';
  var hp=isPast?null:homeWeek(key);
  for(var d=0;d<7;d++){
    var date=addDays(mon,d),a=w.avail[d],p=w.plan[d];
    var past=isPast||(isCur&&d<tIdx);
    var items=[];
    if(p.run==='hard'){items.push(['run',p.run]);if(p.gym)items.push(['gym',p.gym]);}
    else{if(p.gym)items.push(['gym',p.gym]);if(p.run)items.push(['run',p.run]);}
    if(iso(date)<FIRST_DAY)continue;
    if(d<from){h+='<section class="day past" aria-label="'+DAYS[d]+' '+fmtD(date)+'"><div class="day-head"><div class="dname">'+DAYS[d]+'</div><div class="ddate">'+fmtD(date)+'</div></div><div class="rest">Before your start.</div></section>';continue;}
    h+='<section class="day'+(d===tIdx?' today':'')+(past?' past':'')+'" aria-label="'+DAYS[d]+' '+fmtD(date)+'">';
    h+='<div class="day-head"><div class="dname">'+DAYS[d]+'</div><div class="ddate">'+(d===tIdx?'<b>Today</b> · ':'')+fmtD(date)+'</div><div class="toggles">'+
      (hasGym?'<button class="tog gym" data-act="tog" data-d="'+d+'" data-k="gym" aria-pressed="'+a.gym+'"'+(isPast?' disabled':'')+'>'+(a.gym?'Gym':'No gym')+'</button>':'')+
      (hasRun?'<button class="tog run" data-act="tog" data-d="'+d+'" data-k="run" aria-pressed="'+a.run+'"'+(isPast?' disabled':'')+'>'+(a.run?'Run':'No run')+'</button>':'')+'</div></div>';
    if(items.length){
      items.forEach(function(it){h+=sessHTML(key,d,it[0],it[1],w,variant);});
      if(items.length>1)h+='<div class="dbl">Two sessions today. Split them morning and evening if you can'+(p.run==='hard'?', and do the run first.':'.')+'</div>';
    }else{
      h+='<div class="rest">'+(w.pool&&!(a.gym&&hasGym)?'No session today. The plan starts tomorrow.':(a.gym||a.run)?'Rest day. Just the commute.'+(a.run&&!past?' If you feel fresh, an optional 20–30 min easy run is fine.':''):'Blocked. Nothing planned.')+'</div>';
    }
    if(!past&&hp){var hq=hp[d],HH=HOME[hq.hs],hdn=homeDone(hq.ds,hq.hs);h+='<details class="homeopt" data-ok="homep-'+hq.ds+'"'+(openDetails['homep-'+hq.ds]?' open':'')+'><summary><span>At home, optional:</span> <b>'+HH.n+'</b> \u00b7 '+HH.min+' min'+(hdn?' \u2713':'')+'</summary><p class="hint" style="margin:6px 0">'+homeWhy(hq)+'</p>'+homeExList(HH)+'</details>';}
    h+='</section>';
  }
  h+='</div>';
  return h;
}

/* ---------- log ---------- */
function lastFor(name,beforeDate){
  var best=null;
  state.workouts.forEach(function(wk){
    if(beforeDate&&wk.date>beforeDate)return;
    wk.exercises.forEach(function(ex){if(ex.name===name&&(!best||wk.date>=best.date))best={date:wk.date,sets:ex.sets};});
  });
  return best;
}
/* ---------- target engine (double progression) ---------- */
var STEP={'Bench press':2,'Incline press':2,'Lateral raises':1,'Chest flies':2.5,'Tricep pushdown':2.5,'Dips':2.5,
  'Lat pulldown':2.5,'Seated row':2.5,'Single-arm cable row':2.5,'Rear delt cable fly':2.5,'Bicep curls':2,'Hammer curls':2,
  'Squat machine':5,'Bulgarian split squat':2,'Hip thrust':5,'Leg curl':2.5,'Leg extension':2.5,'Calf raises':5,'Hanging knee raises':0,
  'Overhead press':2,'Pull-ups':2.5,'Overhead tricep extension':2};
var ASSIST={'Dips':1,'Pull-ups':1};
function tplFor(name){var f=null;GYM_IDS.forEach(function(g){TPL[g].forEach(function(e){if(!f&&e[0]===name)f=e;});});return f;}
function historyFor(name){
  var out=[];
  state.workouts.forEach(function(wk){if(wk.deload)return;wk.exercises.forEach(function(ex){if(ex.name===name)out.push({date:wk.date,id:wk.id,sets:ex.sets,rir:ex.rir});});});
  out.sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:(a.id<b.id?-1:1);});
  return out;
}
function topOf(sets){return Math.max.apply(null,sets.map(function(s){return s.w==null?0:s.w;}));}
function fill(n,w,r){var a=[];for(var i=0;i<n;i++)a.push({w:w,r:r});return a;}
function r1(x){return Math.round(x*10)/10;}
function suggest(e,ds){
  var name=e[0],n=e[1],lo=e[2],hi=e[3],st=STEP[name]==null?2.5:STEP[name];
  var hist=historyFor(name),wkKey=iso(monday(parse(ds||ui.logDate||iso(todayD()))));
  if(!hist.length){
    return {kind:'first',sets:null,reason:ASSIST[name]?'First time: do as many clean reps as you can, up to '+hi+'. Use the assisted machine if you can’t get '+lo+'.':st===0?'First time: do as many controlled reps as you can, up to '+hi+'.':'First time: pick a weight you could lift about '+(hi+2)+' times, do '+lo+'–'+hi+' reps and stop 2–3 short of failure. Targets start after this.'};
  }
  var last=hist[hist.length-1],top=topOf(last.sets);
  if(top<0)st=5;
  var work=last.sets.filter(function(s){return (s.w==null?0:s.w)===top&&s.r!=null;});
  if(!work.length)return {kind:'reps',sets:fill(n,top,lo),reason:'No reps logged last time. Aim for '+lo+'+ at '+fmtW(top)+'.'};
  var reps=work.map(function(s){return s.r;});
  var avg=reps.reduce(function(a,b){return a+b;},0)/reps.length;
  if(isDeload(wkKey))return {kind:'deload',sets:fill(Math.max(2,n-1),top,Math.max(1,lo-2)),reason:'Lighter week: same weight, one set fewer, and stop 3\u20134 reps short of failure. You\u2019ll come back stronger next week.'};
  if(last.rir!=null&&last.rir>=3&&st>0&&reps.every(function(r){return r>=lo;})&&!reps.every(function(r){return r>=hi;})){
    var ew=r1(top+st);if(top<0&&ew>0)ew=0;
    return {kind:'up',sets:fill(n,ew,lo),reason:'Your last set had 3+ reps left in the tank, so it\u2019s time to go up to '+fmtW(ew)+'. Aim for '+lo+'+.'};
  }
  /* stalled for 3 sessions at the same weight: reset */
  if(hist.length>=3&&st>0){
    var l3=hist.slice(-3),same=l3.every(function(h){return topOf(h.sets)===top;});
    var tot=l3.map(function(h){return h.sets.filter(function(s){return (s.w==null?0:s.w)===top&&s.r!=null;}).reduce(function(a,s){return a+s.r;},0);});
    if(same&&tot[2]<=tot[0]&&!reps.every(function(r){return r>=hi;})){
      var rw=top>0?Math.max(0,r1(Math.round(top*0.9/st)*st)):top-st;if(rw>=top)rw=top-st;
      return {kind:'drop',sets:fill(n,rw,lo),reason:'Stuck at '+fmtW(top)+' for 3 sessions. Drop to '+fmtW(rw)+' and build back up past it.'};
    }
  }
  if(reps.every(function(r){return r>=hi;})&&work.length>=Math.min(2,n)){
    if(st===0)return {kind:'reps',sets:fill(n,top,hi),reason:'Top of the range. Make each rep harder: slow it down, pause, or straighten your legs.'};
    var jump=reps.every(function(r){return r>=hi+3;})?2:1;
    var nw=r1(top+st*jump);if(top<0&&nw>0)nw=0;
    if(top<0)return {kind:'up',sets:fill(n,nw,lo),reason:'You hit '+hi+' on every set, so '+(nw===0?'try them with no assistance':'cut the assistance to '+Math.abs(nw)+'kg')+' and aim for '+lo+'+.'};
    return {kind:'up',sets:fill(n,nw,lo),reason:(jump>1?'Well past '+hi+' on every set, so jump two steps':'You hit '+hi+' on every set, so go up')+' to '+fmtW(nw)+' and aim for '+lo+'+.'};
  }
  if(avg<lo-1&&st>0){
    var dw=top>0?Math.max(0,r1(Math.round(top*0.9/st)*st)):top-st;if(dw>=top)dw=top-st;
    return {kind:'drop',sets:fill(n,dw,lo),reason:'Reps fell short of '+lo+' last time. Drop to '+fmtW(dw)+' and build back up.'};
  }
  var t=[];for(var j=0;j<n;j++){var r=j<reps.length?reps[j]:reps[reps.length-1];t.push({w:top,r:Math.min(hi,r+1)});}
  return {kind:'reps',sets:t,reason:'Same weight, one more rep per set. Once you hit '+hi+' on every set, the weight goes up.'};
}
function fmtTarget(sets){
  if(!sets||!sets.length)return '';
  var w=sets[0].w,wl=w===0?'BW':w<0?Math.abs(r1(w))+'kg assist':r1(w)+'kg';
  return wl+' × '+sets.map(function(s){return s.r;}).join(', ');
}
function defaultGymSession(){
  var key=curWeekKey(),w=getWeek(key),t=dayIdx(todayD());
  for(var d=t;d<7;d++){if(w.plan[d].gym&&!w.done[w.plan[d].gym])return w.plan[d].gym;}
  return 'push';
}
function setRow(i,j,ph){
  return '<div class="setrow"><span class="setn">'+(j+1)+'</span>'+
    '<label class="sr"><input type="number" inputmode="decimal" step="0.1" min="0" id="w-'+i+'-'+j+'" placeholder="'+(ph&&ph.w!=null?Math.abs(r1(ph.w)):'')+'" aria-label="Set '+(j+1)+' weight in kg"><span>kg</span></label>'+
    '<label class="sr"><input type="number" inputmode="numeric" min="0" id="r-'+i+'-'+j+'" placeholder="'+(ph&&ph.r!=null?ph.r:'')+'" aria-label="Set '+(j+1)+' reps"><span>reps</span></label></div>';
}
function exBlock(e,i,date){
  var last=lastFor(e[0]),sg=suggest(e,date),ph=sg.sets||[],rows='';
  for(var j=0;j<e[1];j++)rows+=setRow(i,j,ph[j]);
  var assisted=ASSIST[e[0]]&&ph.length&&ph[0].w<0;
  var tw=ph.length?ph[0].w:0,st=STEP[e[0]]==null?2.5:STEP[e[0]];
  var warm=(i===0&&tw>0&&st>0)?'<div class="tip">Warm up first: 1 set of 8 at about '+fmtW(Math.max(st,Math.round(tw/2/st)*st))+'.</div>':'';
  return '<div class="ex" data-ex="'+i+'" data-name="'+esc(e[0])+'">'+
    '<div class="ex-head"><div><div class="ex-name">'+e[0]+'</div><div class="ex-target">'+e[1]+' × '+rr(e)+(last?' · Last ('+fmtS(last.date)+'): '+fmtSets(last.sets):' · No history yet')+'</div></div>'+
    (sg.sets?'<button class="btn sm ghost" data-act="usetargets" data-ex="'+i+'">Use targets</button>':'')+'</div>'+
    '<div class="target '+sg.kind+'">'+(sg.sets?'<b>Today: '+fmtTarget(sg.sets)+'</b>':'')+'<span>'+sg.reason+'</span></div>'+warm+
    (ASSIST[e[0]]?'<label class="assist"><input type="checkbox" id="as-'+i+'"'+(assisted?' checked':'')+'> Using the assisted machine (kg = assistance)</label>':'')+
    '<div class="sets">'+rows+'</div><button class="linkbtn" data-act="addset" data-ex="'+i+'">+ Add set</button>'+
    '<div class="rir"><span>Last set: how many more reps could you have done?</span><div class="chips">'+[[0,'0'],[1,'1'],[2,'2'],[3,'3+']].map(function(x){return '<button class="pill" data-act="rir" data-ex="'+i+'" data-v="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div><input type="hidden" id="rir-'+i+'" value=""></div></div>';
}
function renderLog(){
  var k=ui.logKind,h='';
  h+='<div class="seg" role="group" aria-label="What to log">'+[['gym','Gym'],['run','Run'],['other','Other'],['bw','Weight']].map(function(x){return '<button data-act="lk" data-k="'+x[0]+'" aria-pressed="'+(k===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>';
  var date=ui.logDate||iso(todayD());
  if(k==='gym'){
    var sid=ui.logSession||defaultGymSession();ui.logSession=sid;
    h+='<div class="card gymform"><div id="draftnote"></div>'+(isDeload(iso(monday(parse(date))))?'<div class="dlnote">Lighter week: the targets below drop a set and keep the weight the same. Stop 3\u20134 reps short of failure.</div>':'')+'<div class="row2"><label>Date<input type="date" min="'+FIRST_DAY+'" id="lg-date" value="'+date+'"></label>'+
      '<label>Session<select id="lg-session">'+GYM_IDS.map(function(g){return '<option value="'+g+'"'+(g===sid?' selected':'')+'>'+SESS[g].name+'</option>';}).join('')+'</select></label></div>'+
      '<p class="hint" style="margin:0">Grey numbers are today’s targets, worked out from last time. Type just the reps if you used the target weight. Empty sets are skipped.</p>'+
      TPL[sid].map(function(e,i){return exBlock(e,i,date);}).join('')+
      '<label>Notes<textarea id="lg-note" rows="2" placeholder="How it felt, what to change next time"></textarea></label>'+
      '<div class="err" id="lg-err"></div><button class="btn primary" data-act="savegym">Save workout</button></div>';
  }else if(k==='run'){
    var rt=ui.runType||'Easy';
    h+='<div class="card"><div class="row2"><label>Date<input type="date" min="'+FIRST_DAY+'" id="rn-date" value="'+date+'"></label>'+
      '<label>Type<select id="rn-type">'+RUN_TYPES.map(function(t){return '<option'+(t===rt?' selected':'')+'>'+t+'</option>';}).join('')+'</select></label></div>'+
      '<div class="row3"><label>Distance (km)<input type="number" inputmode="decimal" step="0.01" min="0" id="rn-km" placeholder="5.0"></label>'+
      '<label>Minutes<input type="number" inputmode="numeric" min="0" id="rn-min" placeholder="21"></label>'+
      '<label>Seconds<input type="number" inputmode="numeric" min="0" max="59" id="rn-sec" placeholder="30"></label></div>'+
      '<label>Average heart rate (optional)<input type="number" inputmode="numeric" min="0" id="rn-hr" placeholder="bpm"></label>'+
      '<div class="pace-live" id="rn-pace">— <small>per km</small></div>'+
      '<p class="hint" style="margin:0">For intervals, log just the fast reps (e.g. 5 km in 20:15) so the pace is your rep pace.</p>'+
      '<label class="check"><input type="checkbox" id="rn-extra"'+(trainOn(date).run?'':' checked')+'> Not part of the plan (e.g. a social run). It adds to that day\u2019s calories and won\u2019t tick off a planned run.</label>'+
      '<label>Notes<textarea id="rn-note" rows="2" placeholder="Route, who with, how it felt"></textarea></label>'+
      '<div class="err" id="rn-err"></div><button class="btn primary" data-act="saverun">Save run</button></div>';
  }else if(k==='other'){
    var at=ACTS[ui.actType]?ui.actType:'walk',ai=ui.actInt==null?1:ui.actInt;
    h+='<div class="card actform"><p class="hint" style="margin:0">Anything outside the plan. It adds to that day\u2019s calorie target. For an unplanned run, use <button class="linkbtn" data-act="lk" data-k="run">Run</button> instead so it counts towards your running.</p>'+
      '<div class="chips">'+Object.keys(ACTS).map(function(a){return '<button class="pill'+(a===at?' on':'')+'" data-act="acttype" data-v="'+a+'" aria-pressed="'+(a===at)+'">'+ACTS[a].n+'</button>';}).join('')+'</div>'+
      '<div class="row2"><label>Date<input type="date" min="'+FIRST_DAY+'" id="ac-date" value="'+date+'"></label><label>Minutes<input id="ac-min" type="number" inputmode="numeric" min="1" placeholder="45"></label></div>'+
      '<div class="seg" style="margin:0" role="group" aria-label="How hard">'+['Easy','Moderate','Hard'].map(function(x,i){return '<button data-act="actint" data-v="'+i+'" aria-pressed="'+(ai===i)+'">'+x+'</button>';}).join('')+'</div>'+
      '<div class="pace-live" id="ac-kcal">\u2014 <small>kcal</small></div>'+
      '<label>Notes<textarea id="ac-note" rows="2" placeholder="Where, who with"></textarea></label>'+
      '<div class="err" id="ac-err"></div><button class="btn primary" data-act="saveact">Save activity</button></div>';
  }else{
    var lastW=state.weights.slice().sort(function(a,b){return a.date<b.date?1:-1;})[0];
    h+='<div class="card"><div class="row2"><label>Date<input type="date" min="'+FIRST_DAY+'" id="bw-date" value="'+date+'"></label>'+
      '<label>Weight (kg)<input type="number" inputmode="decimal" step="0.1" min="0" id="bw-kg" placeholder="'+(lastW?lastW.kg:'')+'"></label></div>'+
      '<p class="hint" style="margin:0">Weigh in the same way each time, ideally first thing in the morning.</p>'+
      '<div class="err" id="bw-err"></div><button class="btn primary" data-act="savebw">Save weight</button></div>';
  }
  h+='<h2>History</h2>'+renderHistory();
  return h;
}
function renderHistory(){
  var items=[];
  state.workouts.forEach(function(w){items.push({cls:'',type:'workouts',id:w.id,date:w.date,title:SESS[w.session]?SESS[w.session].name:'Workout',sum:w.exercises.map(function(e){return e.name+' '+fmtSets(e.sets);}).join(' · ')+(w.note?' — '+esc(w.note):'')});});
  state.runs.forEach(function(r){items.push({cls:'run',type:'runs',id:r.id,date:r.date,title:r.type+(r.extra?' (unplanned)':''),strava:!!r.strava,rtype:r.type,sum:r.km+' km · '+fmtTime(r.sec)+' · '+fmtPace(r.sec/r.km)+'/km'+(r.hr?' · '+r.hr+' bpm':'')+(r.note?' — '+esc(r.note):'')});});
  (state.activities||[]).forEach(function(a){items.push({cls:'act',type:'activities',id:a.id,date:a.date,title:actName(a),sum:a.min+' min \u00b7 '+['easy','moderate','hard'][a.int==null?1:a.int]+' \u00b7 ~'+actKcal(a)+' kcal'+(a.note?' \u2014 '+esc(a.note):'')});});
  state.weights.forEach(function(b){items.push({cls:'bw',type:'weights',id:b.id,date:b.date,title:'Bodyweight',sum:b.kg+' kg'});});
  items.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:(a.id<b.id?1:-1);});
  if(!items.length)return '<div class="empty">Nothing logged yet.</div>';
  var show=ui.histAll?items:items.slice(0,12);
  var h='<div class="hist">'+show.map(function(it){
    return '<div class="hist-item '+it.cls+'"><span class="bar"></span><div class="hist-main"><div class="hist-title">'+(it.strava?'<select class="rtype" data-id="'+esc(it.id)+'" aria-label="Run type">'+RUN_TYPES.map(function(x){return '<option'+(x===it.rtype?' selected':'')+'>'+x+'</option>';}).join('')+'</select>':esc(it.title))+'<small>'+(it.strava?(it.title.indexOf('(unplanned)')>0?'unplanned · ':'')+'Strava · ':'')+''+fmtS(it.date)+' '+it.date.slice(0,4)+'</small></div><div class="hist-sum">'+it.sum+'</div></div>'+
      '<button class="del" data-act="del" data-type="'+it.type+'" data-id="'+esc(it.id)+'">Delete</button></div>';
  }).join('')+'</div>';
  if(items.length>12)h+='<button class="linkbtn" data-act="histall">'+(ui.histAll?'Show fewer':'Show all '+items.length)+'</button>';
  return h;
}

/* ---------- progress ---------- */
function chartW(){var r=document.getElementById('root');var w=(r&&r.clientWidth)||380;return Math.max(280,Math.min(720,w)-32-28);}
function niceTicks(lo,hi,n){var out=[];for(var i=0;i<n;i++)out.push(lo+(hi-lo)*i/(n-1));return out;}
function lineChart(o){
  var pts=o.points.slice().sort(function(a,b){return a.t-b.t;});
  if(!pts.length)return '<div class="empty">'+o.empty+'</div>';
  var W=chartW(),H=o.h||190,L=44,R=14,T=16,B=26;
  var ys=pts.map(function(p){return p.y;});if(o.goal!=null)ys.push(o.goal);
  var lo=Math.min.apply(null,ys),hi=Math.max.apply(null,ys);
  if(hi-lo<(o.minSpan||1)){var mid=(hi+lo)/2;lo=mid-(o.minSpan||1)/2;hi=mid+(o.minSpan||1)/2;}
  var sp=hi-lo;lo-=sp*0.1;hi+=sp*0.1;
  var t0=pts[0].t,t1=pts[pts.length-1].t;if(t1===t0){t0-=4*864e5;t1+=4*864e5;}
  var X=function(t){return L+(t-t0)/(t1-t0)*(W-L-R);};
  var Y=function(v){var f=(v-lo)/(hi-lo);return o.invert?T+f*(H-T-B):H-B-f*(H-T-B);};
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.label)+'">';
  niceTicks(lo,hi,4).forEach(function(v){var y=Y(v).toFixed(1);s+='<line class="gridl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/><text class="ax" x="'+(L-6)+'" y="'+(+y+4)+'" text-anchor="end">'+o.fmt(v)+'</text>';});
  if(o.goal!=null){var gy=Y(o.goal).toFixed(1);s+='<line class="goal-l" x1="'+L+'" x2="'+(W-R)+'" y1="'+gy+'" y2="'+gy+'"/><text class="lab" x="'+(W-R)+'" y="'+(+gy-5)+'" text-anchor="end">'+o.goalLabel+'</text>';}
  if(o.line&&pts.length>1){
    var d=pts.map(function(p,i){return (i?'L':'M')+X(p.t).toFixed(1)+' '+Y(p.y).toFixed(1);}).join(' ');
    s+='<path class="area '+o.cls+'" d="'+d+' L'+X(pts[pts.length-1].t).toFixed(1)+' '+(H-B)+' L'+X(pts[0].t).toFixed(1)+' '+(H-B)+' Z"/>';
    s+='<path class="ln '+o.cls+'" d="'+d+'"/>';
  }
  pts.forEach(function(p,i){var last=i===pts.length-1;s+='<circle class="'+(p.c||('f-'+o.cls))+'" cx="'+X(p.t).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+'" r="'+(last?5:3.5)+'"/>';});
  var lp=pts[pts.length-1],lx=X(lp.t),anchor=lx>W-60?'end':'middle';
  s+='<text class="lab" x="'+lx.toFixed(1)+'" y="'+(Y(lp.y)-9).toFixed(1)+'" text-anchor="'+anchor+'">'+o.fmt(lp.y)+'</text>';
  var xl=[pts[0]];if(pts.length>1)xl.push(pts[pts.length-1]);
  xl.forEach(function(p,i){s+='<text class="ax" x="'+X(p.t).toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(xl.length===1?'middle':i===0?'start':'end')+'">'+fmtD(new Date(p.t))+'</text>';});
  return s+'</svg>';
}
function barChart(bars,fmt){
  var W=chartW(),H=170,L=10,R=10,T=20,B=26,n=bars.length;
  var mx=Math.max.apply(null,bars.map(function(b){return b.v;}).concat([1]));
  var bw=(W-L-R)/n,s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Running distance per week">';
  s+='<line class="gridl" x1="'+L+'" x2="'+(W-R)+'" y1="'+(H-B)+'" y2="'+(H-B)+'"/>';
  bars.forEach(function(b,i){
    var h=(H-T-B)*b.v/mx,x=L+i*bw+bw*0.18,w=bw*0.64,y=H-B-h;
    if(b.v>0)s+='<rect class="bar-r'+(b.cur?' cur':'')+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3"/>';
    s+='<text class="'+(b.v>0?'lab':'ax')+'" x="'+(x+w/2).toFixed(1)+'" y="'+(y-5).toFixed(1)+'" text-anchor="middle">'+(b.v>0?fmt(b.v):'0')+'</text>';
    if(n<=8||i%2===0)s+='<text class="ax" x="'+(x+w/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+b.label+'</text>';
  });
  return s+'</svg>';
}
/* ---------- goals ---------- */
var BWX={'Dips':1,'Pull-ups':1,'Hanging knee raises':1};
var EFFORT={'Tempo':1,'Time trial / race':1};
function riegel(sec,km,D){return sec*Math.pow(D/km,1.06);}
function bodyKg(){var ws=state.weights.slice().sort(function(a,b){return a.date<b.date?-1:1;});return ws.length?+ws[ws.length-1].kg:65;}
function e1rm(load,r){return r<=1?load:load*(1+r/30);}
function loadOf(ex,w){return BWX[ex]?bodyKg()+(w||0):(w||0);}
function linreg(pts){
  var n=pts.length;if(n<2)return null;
  var mx=0,my=0;pts.forEach(function(p){mx+=p.t;my+=p.y;});mx/=n;my/=n;
  var sxx=0,sxy=0;pts.forEach(function(p){sxx+=(p.t-mx)*(p.t-mx);sxy+=(p.t-mx)*(p.y-my);});
  if(!sxx)return null;var b=sxy/sxx;return {perDay:b*864e5};
}
function fmtKm(km){return (Math.round(km*100)/100)+' km';}
function goalTitle(g){
  if(g.kind==='run')return fmtKm(g.km)+' in '+fmtTime(g.sec);
  return g.ex+' '+(g.w===0?'':g.w<0?Math.abs(g.w)+'kg assist ':g.w+'kg ')+'× '+g.r;
}
function activeRunGoal(){
  var gs=state.goals.filter(function(g){return g.kind==='run';});
  for(var i=0;i<gs.length;i++){if(!runStatus(gs[i]).achieved)return gs[i];}
  return gs.length?gs[gs.length-1]:null;
}
function goalPace5(){var g=activeRunGoal();if(!g)return 240;return riegel(g.sec,g.km,5)/5;}
function etaText(days){
  if(days==null)return null;
  if(days<=3)return 'Any day now';
  if(days>365)return 'Over a year at this rate';
  var d=addDays(todayD(),Math.round(days));
  return fmtD(d)+(d.getFullYear()!==todayD().getFullYear()?' '+d.getFullYear():'')+' <small>(~'+Math.max(1,Math.round(days/7))+' wk)</small>';
}
function runStatus(g){
  var D=g.km,minKm=Math.max(1.5,D*0.5),cutoff=iso(addDays(todayD(),-56)),c84=iso(addDays(todayD(),-84));
  var runs=state.runs.filter(function(r){return r.km>0&&r.sec>0&&r.type!=='Intervals';}).sort(function(a,b){return a.date<b.date?-1:1;});
  var st={achieved:null,actual:null,pred:null,eta:null,rate:null};
  runs.forEach(function(r){
    if(r.km>=D*0.99){var t=r.sec*D/r.km;if(r.km<=D*1.1&&(st.actual==null||t<st.actual))st.actual=t;if(t<=g.sec&&!st.achieved)st.achieved=r.date;}
    if(r.km>=minKm&&r.date>=cutoff){var p=riegel(r.sec,r.km,D);if(st.pred==null||p<st.pred)st.pred=p;}
  });
  var cands=[st.actual,st.pred].filter(function(x){return x!=null;});
  st.current=cands.length?Math.min.apply(null,cands):riegel(fitness().sec,5,D);
  st.estimated=!cands.length;
  var pts=runs.filter(function(r){return EFFORT[r.type]&&r.km>=minKm&&r.date>=c84;}).map(function(r){return {t:parse(r.date).getTime(),y:riegel(r.sec,r.km,D)};});
  if(pts.length>=2&&(pts[pts.length-1].t-pts[0].t)>=14*864e5){
    var reg=linreg(pts);
    if(reg){st.rate=reg.perDay*7;if(reg.perDay<0&&st.current>g.sec)st.eta=(st.current-g.sec)/(-reg.perDay);}
  }
  var base=g.base||(pts.length?pts[0].y:st.current);
  st.progress=st.achieved?1:(base&&st.current&&base>g.sec)?Math.max(0,Math.min(1,(base-st.current)/(base-g.sec))):0;
  return st;
}
function liftStatus(g){
  var hist=historyFor(g.ex),target=e1rm(loadOf(g.ex,g.w),g.r),st={achieved:null,current:null,best:null,eta:null,rate:null,target:target};
  var pts=[];
  hist.forEach(function(h){
    var best=0,bs=null;
    h.sets.forEach(function(s){
      if(s.r==null||s.r<1)return;
      if(!st.achieved&&(s.w||0)>=g.w&&s.r>=g.r)st.achieved=h.date;
      var v=e1rm(loadOf(g.ex,s.w),s.r);if(v>best){best=v;bs=s;}
    });
    if(best)pts.push({t:parse(h.date).getTime(),date:h.date,y:best,set:bs});
  });
  if(!pts.length){st.progress=st.achieved?1:0;return st;}
  st.current=pts[pts.length-1];
  st.best=pts.reduce(function(a,p){return p.y>a.y?p:a;},pts[0]);
  var start=pts.filter(function(p){return p.date>=g.created;})[0]||pts[0];
  st.progress=st.achieved?1:target>start.y?Math.max(0,Math.min(1,(st.best.y-start.y)/(target-start.y))):1;
  var lastT=pts[pts.length-1].t,recent=pts.filter(function(p){return p.t>=lastT-56*864e5;});
  if(recent.length>=3&&(lastT-recent[0].t)>=10*864e5){
    var reg=linreg(recent);
    if(reg){st.rate=reg.perDay*7;if(reg.perDay>0&&st.best.y<target)st.eta=(target-st.best.y)/reg.perDay;}
  }
  return st;
}
function nextGoals(g){
  if(g.kind==='run'){
    var cut=g.km<=5?30:g.km<=10?60:g.km<=21.1?180:300;
    var longer=g.km<5?5:g.km<10?10:g.km<21.1?21.1:null;
    var out=[{label:'Faster: '+fmtKm(g.km)+' in '+fmtTime(g.sec-cut),g:{kind:'run',km:g.km,sec:g.sec-cut,base:g.sec}}];
    if(longer){var eq=Math.ceil(riegel(g.sec,g.km,longer)/60)*60-1;out.push({label:'Longer: '+fmtKm(longer)+' in '+fmtTime(eq),g:{kind:'run',km:longer,sec:eq}});}
    return out;
  }
  if(BWX[g.ex]&&g.w<=0){
    return [{label:'More reps: '+goalTitle({kind:'lift',ex:g.ex,w:g.w,r:g.r+2}),g:{kind:'lift',ex:g.ex,w:g.w,r:g.r+2}},
      {label:g.w<0?'Less assistance':'Weighted: +5kg × '+g.r,g:{kind:'lift',ex:g.ex,w:g.w<0?Math.min(0,g.w+10):5,r:g.r}}];
  }
  var stp=g.w>=40?5:2.5;
  return [{label:'Heavier: '+(g.w+stp)+'kg × '+g.r,g:{kind:'lift',ex:g.ex,w:g.w+stp,r:g.r}},
    {label:'More reps: '+g.w+'kg × '+(g.r+2),g:{kind:'lift',ex:g.ex,w:g.w,r:g.r+2}}];
}
function allExerciseNames(){
  var names={};GYM_IDS.forEach(function(g){TPL[g].forEach(function(e){names[e[0]]=1;});});
  state.workouts.forEach(function(w){w.exercises.forEach(function(e){names[e.name]=1;});});
  return Object.keys(names).sort();
}
function goalCard(g){
  var h='<div class="gcard'+(g.kind==='run'?' run':'')+'">',st,cur,foot,ach;
  if(g.kind==='run'){
    st=runStatus(g);ach=st.achieved;
    cur=st.current!=null?fmtTime(st.current):'—';
    foot=st.current==null?'Log a run to start':st.estimated?'Your starting estimate':st.actual!=null&&st.actual<=st.pred?'Best actual '+fmtKm(g.km):'Predicted from runs '+fmtKm(Math.max(1.5,g.km*0.5))+'+';
  }else{
    st=liftStatus(g);ach=st.achieved;
    cur=st.best?fmtSet(st.best.set):'—';
    foot=st.best?'Best set ('+fmtS(st.best.date)+')':'Log '+esc(g.ex)+' to start';
  }
  var eta=ach?'<span class="gbadge">Achieved '+fmtS(ach)+'</span>':etaText(st.eta);
  var etaFoot=ach?'':st.eta!=null?'At your recent rate':g.kind==='run'?'Needs 2+ tempo runs or time trials, 2 weeks apart':'Needs 3+ sessions over 10+ days';
  h+='<div class="ghead"><div class="gtitle">'+esc(goalTitle(g))+'</div><div class="gacts"><button class="linkbtn" data-act="gedit" data-id="'+g.id+'">Edit</button><button class="del" data-act="gdel" data-id="'+g.id+'">Delete</button></div></div>';
  h+='<div class="gbar"><span style="width:'+Math.round(st.progress*100)+'%"></span></div>';
  h+='<div class="goal"><div class="tile"><div class="lbl">Now</div><div class="val">'+cur+'</div><div class="foot">'+foot+'</div></div>'+
    '<div class="tile gtarget"><div class="lbl">Goal</div><div class="val">'+(g.kind==='run'?fmtTime(g.sec):(g.w===0?'BW':g.w<0?Math.abs(g.w)+'a':g.w)+'×'+g.r)+'</div><div class="foot">'+(g.kind==='run'?fmtPace(g.sec/g.km)+'/km':g.w===0?'Bodyweight':g.w<0?'kg assistance':'kg')+'</div></div>'+
    '<div class="tile"><div class="lbl">Estimate</div><div class="val sm">'+(eta||'—')+'</div><div class="foot">'+etaFoot+'</div></div></div>';
  if(st.rate!=null&&!ach){
    h+='<div class="hint" style="margin:0">'+(g.kind==='run'?(st.rate<0?'Getting faster by about '+Math.abs(Math.round(st.rate))+' s a week.':'No speed gain over your recent hard runs yet.'):(st.rate>0?'Estimated max up about '+(Math.round(st.rate*10)/10)+'kg a week. Early gains are quick, so expect this to slow.':'No upward trend in your recent sessions yet.'))+'</div>';
  }
  if(ach){
    h+='<div class="gnext"><span>Set the next goal:</span>'+nextGoals(g).map(function(n,i){return '<button class="btn sm" data-act="gnext" data-id="'+g.id+'" data-i="'+i+'">'+esc(n.label)+'</button>';}).join('')+'</div>';
  }
  return h+'</div>';
}
function goalForm(){
  var f=ui.goalForm,g=f.id?state.goals.filter(function(x){return x.id===f.id;})[0]:null,k=g?g.kind:f.kind;
  var h='<div class="card gform"><div class="gtitle">'+(g?'Edit goal':'New goal')+'</div>';
  if(!g)h+='<div class="seg" style="margin:0" role="group" aria-label="Goal type">'+[['run','Run'],['lift','Lift']].map(function(x){return '<button data-act="gkind" data-k="'+x[0]+'" aria-pressed="'+(k===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>';
  if(k==='run'){
    var km=g?g.km:5,sec=g?g.sec:1199;
    h+='<div class="chips">'+[[5,'5k'],[10,'10k'],[21.1,'Half'],[42.2,'Marathon']].map(function(c){return '<button class="pill" data-act="gkm" data-km="'+c[0]+'">'+c[1]+'</button>';}).join('')+'</div>'+
      '<label>Distance (km)<input type="number" inputmode="decimal" step="0.1" min="0" id="gf-km" value="'+km+'"></label>'+
      '<div class="row3"><label>Hours<input type="number" inputmode="numeric" min="0" id="gf-h" value="'+Math.floor(sec/3600)+'"></label>'+
      '<label>Minutes<input type="number" inputmode="numeric" min="0" max="59" id="gf-m" value="'+Math.floor(sec%3600/60)+'"></label>'+
      '<label>Seconds<input type="number" inputmode="numeric" min="0" max="59" id="gf-s" value="'+(sec%60)+'"></label></div>'+
      '<div class="hint" style="margin:0" id="gf-pace"></div>';
  }else{
    var ex=g?g.ex:'Bench press';
    h+='<label>Exercise<select id="gf-ex">'+allExerciseNames().map(function(n){return '<option'+(n===ex?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select></label>'+
      '<div class="row2"><label>Weight (kg)<input type="number" inputmode="decimal" step="0.5" id="gf-w" value="'+(g?Math.abs(g.w):'')+'" placeholder="0 = bodyweight"></label>'+
      '<label>Reps<input type="number" inputmode="numeric" min="1" id="gf-r" value="'+(g?g.r:'')+'" placeholder="8"></label></div>'+
      '<p class="hint" style="margin:0">Use the same weight you log for this exercise, e.g. per dumbbell if you use dumbbells. For pull-ups and dips, 0 means bodyweight and anything above it is extra weight.</p>';
  }
  h+='<div class="err" id="gf-err"></div><div class="row2"><button class="btn" data-act="gcancel">Cancel</button><button class="btn primary" data-act="gsave">Save goal</button></div></div>';
  return h;
}
function renderGoals(){
  var h='<h2>Goals</h2>';
  var withSt=state.goals.map(function(g){return {g:g,a:g.kind==='run'?runStatus(g).achieved:liftStatus(g).achieved};});
  var active=withSt.filter(function(x){return !x.a;}),done=withSt.filter(function(x){return x.a;});
  if(ui.goalForm)h+=goalForm();
  h+='<div class="goals">'+active.concat(done).map(function(x){return goalCard(x.g);}).join('')+'</div>';
  if(!state.goals.length)h+='<div class="empty">No goals yet.</div>';
  if(!ui.goalForm)h+='<button class="btn" style="margin-top:10px" data-act="gadd">+ Add a goal</button>';
  return h;
}

function renderProgress(){
  var runs=state.runs,h='';
  h+=renderGoals();
  var gp=(function(){var rg=activeRunGoal();return rg?rg.sec/rg.km:240;})();
  h+=volumeHTML();
  h+='<h2>Run pace</h2><div class="card chart">'+lineChart({
    points:runs.filter(function(r){return r.km&&r.sec;}).map(function(r){return {t:parse(r.date).getTime(),y:r.sec/r.km,c:RUN_CLS[r.type]};}),
    invert:true,goal:gp,goalLabel:'Goal pace '+fmtPace(gp)+'/km',fmt:fmtPace,minSpan:30,label:'Pace per run over time, faster is higher',
    empty:'Log your first run and your pace will show here, against your goal pace.'
  })+'<div class="legend">'+RUN_TYPES.map(function(t){return '<span><i class="'+RUN_CLS[t]+'" style="background:currentColor"></i>'+t+'</span>';}).join('')+'</div></div>';

  var wk=monday(todayD()),bars=[];
  for(var i=7;i>=0;i--){
    var m=addDays(wk,-7*i),k0=iso(m),k1=iso(addDays(m,6));
    var km=runs.filter(function(r){return r.date>=k0&&r.date<=k1;}).reduce(function(a,r){return a+(+r.km||0);},0);
    bars.push({label:fmtD(m),v:Math.round(km*10)/10,cur:i===0});
  }
  h+='<h2>Running per week</h2><div class="card chart">'+barChart(bars,function(v){return v+'';})+'<div class="hint" style="margin:0">Kilometres run each week (cycling not included). The lighter bar is this week so far. Add no more than about 10% a week.</div></div>';

  var names={};GYM_IDS.forEach(function(g){TPL[g].forEach(function(e){names[e[0]]=1;});});
  state.workouts.forEach(function(w){w.exercises.forEach(function(e){names[e.name]=1;});});
  var list=Object.keys(names).sort();
  if(!names[ui.exercise])ui.exercise=list[0];
  var hist=state.workouts.filter(function(w){return w.exercises.some(function(e){return e.name===ui.exercise;});}).sort(function(a,b){return a.date<b.date?-1:1;});
  var spts=hist.map(function(w){var ex=w.exercises.filter(function(e){return e.name===ui.exercise;})[0];return {t:parse(w.date).getTime(),y:Math.max.apply(null,ex.sets.map(function(s){return s.w||0;})),sets:ex.sets,date:w.date};});
  h+='<h2>Strength</h2><div class="card chart"><label>Exercise<select id="pg-ex">'+list.map(function(n){return '<option'+(n===ui.exercise?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select></label>'+
    lineChart({points:spts,line:true,cls:'gym',goal:(function(){var lg=state.goals.filter(function(x){return x.kind==='lift'&&x.ex===ui.exercise&&x.w>0&&!liftStatus(x).achieved;})[0];return lg?lg.w:null;})(),goalLabel:(function(){var lg=state.goals.filter(function(x){return x.kind==='lift'&&x.ex===ui.exercise&&x.w>0;})[0];return lg?'Goal '+lg.w+'kg \u00d7 '+lg.r:'';})(),fmt:function(v){return v<0?'−'+(Math.round(-v*10)/10)+'kg':(Math.round(v*10)/10)+'kg';},minSpan:4,label:'Top set weight for '+ui.exercise,empty:'No '+esc(ui.exercise)+' logged yet. It’ll chart your heaviest set each session.'});
  if(spts.length){
    h+='<table class="sets-table"><tbody>'+spts.slice().reverse().slice(0,6).map(function(p){return '<tr><td>'+fmtS(p.date)+'</td><td>'+fmtSets(p.sets)+'</td></tr>';}).join('')+'</tbody></table>';
  }
  h+='</div>';

  var bw=state.weights.map(function(b){return {t:parse(b.date).getTime(),y:+b.kg};});
  h+='<h2>Bodyweight</h2><div class="card chart">'+lineChart({points:bw,line:true,cls:'acc',fmt:function(v){return (Math.round(v*10)/10)+'kg';},minSpan:2,label:'Bodyweight over time',empty:'Log your weight to see the trend.'})+
    '<div class="hint" style="margin:0">To build muscle, a slow climb of about 0.25–0.5 kg a month is a good sign.</div></div>';
  h+=checkinHTML();
  return h;
}

/* ---------- food: data ---------- */
var FCATS=['Fruit & veg','Fridge','Freezer','Cupboard'];
/* u: g|ml|each. k/p: per 100g/ml, or per item for each. pk: pack size, pl: pack label, shelf: days fresh after buying */
var FI={
  banana:{n:'Bananas',c:'Fruit & veg',u:'each',pk:5,pl:'bunch of 5',k:105,p:1.3,shelf:6,un:['banana','bananas']},
  apple:{n:'Apples',c:'Fruit & veg',u:'each',pk:6,pl:'bag of 6',k:60,p:0.5,shelf:21,un:['apple','apples']},
  onion:{n:'Onions',c:'Fruit & veg',u:'each',pk:3,pl:'net of 3',k:55,p:1.7,shelf:21,un:['onion','onions']},
  pepper:{n:'Peppers',c:'Fruit & veg',u:'each',pk:3,pl:'pack of 3',k:45,p:1.5,shelf:7,un:['pepper','peppers']},
  broccoli:{n:'Broccoli',c:'Fruit & veg',u:'g',pk:350,pl:'head (~350g)',k:34,p:2.8,shelf:5},
  spinach:{n:'Baby spinach',c:'Fruit & veg',u:'g',pk:200,pl:'200g bag',k:25,p:2.8,shelf:5},
  garlic:{n:'Garlic',c:'Fruit & veg',u:'each',pk:10,pl:'bulb (~10 cloves)',k:4,p:0.2,shelf:30,un:['clove','cloves']},
  milk:{n:'Semi-skimmed milk',c:'Fridge',u:'ml',pk:2272,pl:'4-pint bottle',k:47,p:3.4,shelf:7},
  cheddar:{n:'Grated mature cheddar',c:'Fridge',u:'g',pk:250,pl:'250g bag',k:416,p:25,shelf:21,tip:'Freezes well if it won’t get used in time.'},
  eggs:{n:'Large eggs',c:'Fridge',u:'each',pk:12,pl:'box of 12',k:78,p:7.5,shelf:21,un:['egg','eggs']},
  mince:{n:'5% fat beef mince',c:'Fridge',u:'g',pk:500,pl:'500g pack',k:132,p:21.9,shelf:3},
  chicken:{n:'Chicken breast fillets (frozen)',c:'Freezer',u:'g',pk:1000,pl:'1kg bag',k:110,p:22,defrost:true},
  salmon:{n:'Salmon fillets (frozen, ~110g each)',c:'Freezer',u:'each',pk:4,pl:'pack of 4',k:230,p:22.5,defrost:true,un:['salmon fillet','salmon fillets'],tip:'Figures are for farmed Atlantic salmon. Wild pink salmon fillets have the same protein but about half the calories.'},
  bread:{n:'Wholemeal bread (keep frozen)',c:'Freezer',u:'each',pk:20,pl:'800g loaf',k:88,p:4,un:['slice','slices'],tip:'Freeze the loaf as soon as you get home and toast from frozen.'},
  burrito:{n:'Freezer burritos (made by you)',c:'Freezer',u:'each',pk:10,pl:'batch',k:0,p:0,made:true,un:['burrito','burritos']},
  bowl:{n:'Burrito bowls (made by you)',c:'Freezer',u:'each',pk:8,pl:'batch',k:0,p:0,made:true,un:['bowl','bowls']},
  oats:{n:'Porridge oats',c:'Cupboard',u:'g',pk:1000,pl:'1kg bag',k:374,p:11},
  pb:{n:'Peanut butter',c:'Cupboard',u:'g',pk:340,pl:'340g jar',k:610,p:25},
  honey:{n:'Honey',c:'Cupboard',u:'g',pk:340,pl:'340g jar',k:330,p:0.4},
  seeds:{n:'Mixed seeds',c:'Cupboard',u:'g',pk:300,pl:'300g bag',k:580,p:24},
  cinnamon:{n:'Ground cinnamon',c:'Cupboard',u:'g',pk:40,pl:'jar',k:0,p:0},
  nuts:{n:'Mixed nuts (unsalted)',c:'Cupboard',u:'g',pk:200,pl:'200g bag',k:640,p:20},
  whey:{n:'Whey protein powder',c:'Cupboard',u:'g',pk:1000,pl:'1kg bag',k:380,p:73},
  creatine:{n:'Creatine monohydrate',c:'Cupboard',u:'g',pk:250,pl:'250g tub',k:0,p:0,opt:true},
  rice:{n:'Long-grain rice',c:'Cupboard',u:'g',pk:1000,pl:'1kg bag',k:350,p:7},
  pasta:{n:'Dried pasta (any shape)',c:'Cupboard',u:'g',pk:500,pl:'500g bag',k:355,p:12.5},
  tortilla:{n:'Large tortilla wraps',c:'Cupboard',u:'each',pk:8,pl:'pack of 8',k:182,p:5.2,un:['wrap','wraps']},
  blackbeans:{n:'Black beans',c:'Cupboard',u:'each',pk:1,pl:'400g tin',k:255,p:16.5,un:['tin','tins']},
  bakedbeans:{n:'Baked beans',c:'Cupboard',u:'each',pk:1,pl:'415g tin',k:324,p:19.5,un:['tin','tins']},
  tomatoes:{n:'Chopped tomatoes',c:'Cupboard',u:'each',pk:1,pl:'400g tin',k:85,p:4.4,un:['tin','tins']},
  fajita:{n:'Fajita seasoning',c:'Cupboard',u:'each',pk:1,pl:'sachet',k:90,p:2,un:['sachet','sachets']},
  soy:{n:'Soy sauce',c:'Cupboard',u:'ml',pk:150,pl:'150ml bottle',k:70,p:9},
  oil:{n:'Olive oil',c:'Cupboard',u:'ml',pk:500,pl:'500ml bottle',k:824,p:0}
};
var FR={
  porridge:{n:'Porridge with peanut butter, honey & seeds',t:'4 min',ing:[['oats',80],['milk',300],['pb',15],['honey',10],['seeds',15],['cinnamon',1],['creatine',5]],steps:['Put the oats and milk in a large microwaveable bowl (it bubbles up, so go bigger than you think).','Microwave on high for 2 min, stir, then 1 more min until thick. Leave it 1 min to settle.','Top with 1 tbsp peanut butter, 2 tsp honey, 1 tbsp seeds and a pinch of cinnamon.','Stir in 5g creatine if you’re taking it. It has no taste.']},
  banana_nuts:{n:'Banana and mixed nuts',t:'0 min',ing:[['banana',1],['nuts',30]],steps:['Bag up 30g of nuts the night before so it’s grab-and-go.']},
  freezer_lunch:{n:'Freezer lunch and an apple',t:'3 min',ing:[],steps:['Take it to work frozen in the morning; by lunch it’s mostly thawed.','Burrito: unwrap, wrap in kitchen paper, microwave 1–1½ min if thawed or 2½–3 min from frozen, turning halfway.','Burrito bowl: lid ajar, microwave 2 min if thawed or 3–4 min from frozen, stirring halfway until piping hot.'],src:['Reluctant Entertainer: freezer burritos','https://reluctantentertainer.com/freezer-burrito-recipe/']},
  pm_shake:{n:'Protein shake',t:'1 min',ing:[['whey',30],['milk',300]],steps:['Shake 1 scoop (30g) of whey with 300ml cold milk for 20 seconds.','Have it mid-afternoon, or straight after the gym on training days.']},
  eggs_beans:{n:'Scrambled eggs on toast with beans',t:'8 min',ing:[['eggs',3],['bread',2],['bakedbeans',1]],steps:['Tip the beans into a bowl, cover, and microwave 2–3 min, stirring halfway.','Whisk the 3 eggs with a pinch of salt and pepper.','Toast 2 slices from frozen.','Heat a non-stick pan on low with a little oil. Add the eggs and stir slowly for 2–3 min, taking them off while they still look slightly wet. They finish cooking on the plate.']},
  fuel:{n:'Toast with honey',t:'2 min',ing:[['bread',2],['honey',20]],steps:['Toast 2 slices from frozen and drizzle with honey.','Have it 1–2 hours before your run. Quick carbs so you’re fuelled for the hard bits.']},
  d_honeychicken:{n:'Honey-soy chicken stir-fry with rice',t:'20 min',ing:[['chicken',200],['pepper',1],['broccoli',150],['garlic',1],['soy',20],['honey',15],['oil',10],['rice',90]],steps:['Start the rice first: rinse 90g rice and boil it in plenty of salted water for 10\u201312 min, then drain.','Mix the sauce: 2 tbsp soy sauce, 1 tbsp honey, 1 crushed garlic clove and 2 tbsp water.','Cut the defrosted chicken into bite-sized pieces. Slice the pepper and cut the broccoli into small florets.','Heat the oil in a wok or large frying pan on high. Stir-fry the chicken for 5–6 min until golden.','Add the pepper, broccoli and a splash of water. Stir-fry 3–4 min until just tender.','Pour in the sauce and let it bubble for about 2 min until it’s sticky and coats the chicken. Check there’s no pink in the middle.','Serve over the rice.'],src:['BBC Good Food: honey chicken','https://bbcgoodfoodme.com/recipes/honey-chicken']},
  d_salmon:{n:'Honey-garlic salmon with rice & broccoli',t:'20 min',ing:[['salmon',2],['garlic',1],['honey',20],['soy',15],['oil',5],['broccoli',150],['rice',90]],steps:['Start the rice first: rinse 90g rice and boil it in plenty of salted water for 10\u201312 min, then drain.','Use salmon defrosted overnight in the fridge. Pat it dry with kitchen paper and season.','Mix 1 tbsp honey, 1 tbsp soy sauce and 1 crushed garlic clove.','Heat the oil in a non-stick pan on medium-high. Cook the salmon 3–4 min until golden, flip, and cook 2 min more.','Turn the heat down, pour in the sauce and let it bubble 1–2 min, spooning it over the salmon until sticky. Watch it, as honey burns fast.','Meanwhile, microwave the broccoli in a covered bowl with 2 tbsp water for 3\u20134 min. Serve with the rice.'],src:['RecipeTin Eats: honey garlic salmon','https://www.recipetineats.com/honey-garlic-salmon/']},
  d_pasta:{n:'Chicken, tomato & spinach pasta',t:'20 min',ing:[['chicken',200],['onion',0.5],['garlic',2],['tomatoes',1],['spinach',100],['pasta',100],['cheddar',20],['oil',10]],steps:['Boil the pasta in salted water for 10–12 min (check the pack).','Meanwhile, dice the chicken and half the onion, and crush 2 garlic cloves.','Heat the oil in a frying pan. Brown the chicken for 5 min, add the onion for 3 min, then the garlic for 1 min.','Tip in the chopped tomatoes, season, and simmer 5 min until thickened.','Stir in the spinach until it wilts, about 1–2 min.','Drain the pasta, keeping a splash of the water. Toss it through the sauce with that water and top with the cheddar.'],tip:'Wrap the other half of the onion and keep it in the fridge for Friday’s bolognese.',src:['Jo Cooks: tomato spinach chicken pasta','https://www.jocooks.com/recipes/tomato-spinach-chicken-pasta/']},
  d_beefbowl:{n:'Korean-style beef & rice bowl',t:'20 min',ing:[['mince',250],['garlic',2],['soy',25],['honey',15],['oil',5],['spinach',100],['rice',90]],steps:['Start the rice first: rinse 90g rice and boil it in plenty of salted water for 10\u201312 min, then drain.','Mix 2\u00bd tbsp soy sauce, 1 tbsp honey and 2 crushed garlic cloves.','Heat the oil in a frying pan on high. Add half the pack of mince (250g), break it up, and cook 6–8 min until browned and any liquid has gone.','Pour in the sauce and cook 1–2 min until it coats the beef.','Push the beef to one side, add the spinach and stir until it wilts, about 1 min.','Spoon the beef and spinach over the rice.'],tip:'Put the rest of the mince back in the fridge, sealed, for tomorrow’s bolognese.',src:['Little Sunny Kitchen: Korean beef bowl','https://littlesunnykitchen.com/korean-beef-bowl/']},
  d_bolognese:{n:'Quick spaghetti bolognese',t:'25 min',ing:[['mince',250],['onion',1],['garlic',2],['tomatoes',1],['pasta',100],['cheddar',20],['oil',5]],steps:['Finely chop the onion and crush 2 garlic cloves.','Heat the oil in a saucepan and soften the onion for 5 min. Add the garlic for 1 min.','Turn up the heat, add the mince and brown it for 5 min, breaking it up.','Add the chopped tomatoes and a quarter of the tin filled with water. Season, and simmer 10–15 min until thick.','Meanwhile, cook the pasta for 10–12 min. Drain, top with the sauce and the cheddar.'],src:['Easy Peasy Foodie: easy spaghetti bolognese','https://www.easypeasyfoodie.com/easy-peasy-spaghetti-bolognese/']},
  d_fajita:{n:'Chicken fajitas',t:'20 min',ing:[['chicken',200],['pepper',1],['onion',1],['fajita',0.5],['oil',10],['tortilla',2],['cheddar',20]],steps:['Slice the chicken into strips, and the pepper and onion thinly.','Toss the chicken with half the fajita sachet and a teaspoon of the oil.','Heat the rest of the oil in a large frying pan on high. Cook the onion and pepper for 4 min until they start to char, then push them to the side.','Add the chicken and cook 5–6 min until cooked through.','Warm the wraps for 20 seconds in the microwave. Fill with the chicken and veg, and top with cheese.'],src:['Goodto: Hairy Bikers’ chicken fajitas','https://www.goodtoknow.co.uk/recipes/chicken-fajitas']},
  d_friedrice:{n:'Salmon egg-fried rice',t:'15 min',ing:[['salmon',1],['eggs',2],['rice',90],['pepper',1],['garlic',1],['soy',15],['oil',10]],steps:['Cook the 90g rice ahead (the night before, or at least 30 min before) and spread it out to cool. Fried rice works best with cold rice. Get cooked rice into the fridge within an hour and use it within a day.','Use a salmon fillet defrosted overnight. Pat dry, season, and fry in half the oil for 3–4 min each side. Break into chunks and set aside.','Dice the pepper and crush the garlic. Heat the rest of the oil in the same pan and cook the pepper for 3 min, then the garlic for 30 sec.','Push it all to the side, crack in the 2 eggs and scramble until just set.','Add the cold rice, breaking up any clumps, with the soy sauce. Stir-fry 3\u20134 min until piping hot.','Gently fold the salmon back in and serve.'],src:['Just One Cookbook: salmon fried rice','https://www.justonecookbook.com/salmon-fried-rice/']},
  prep_burrito:{n:'Freezer burritos',t:'50 min',makes:['burrito',10],ing:[['chicken',1000],['onion',2],['pepper',2],['garlic',3],['fajita',2],['oil',15],['rice',250],['blackbeans',2],['tomatoes',1],['cheddar',200],['tortilla',10]],steps:['The night before, move the chicken to the fridge to defrost (or use the microwave’s defrost setting).','Dice the chicken, onions and peppers, and crush the garlic. Drain and rinse the beans.','Heat the oil in your biggest pan. Cook the onions and peppers for 5 min, then add the chicken and fajita seasoning and cook 8–10 min until there’s no pink.','Add the garlic, beans and chopped tomatoes. Simmer 5 min until most of the liquid has gone, because a wet filling makes soggy burritos.','Meanwhile, boil 250g rice for 10\u201312 min and drain it well. Stir it through the filling and let it cool for 15\u201320 min.','Warm the wraps for 20 seconds so they fold without cracking. Put a tenth of the filling and 20g cheese on each, fold in the sides, and roll up tightly.','Wrap each one in foil or baking paper, put them in a freezer bag, write the date on it and freeze. Best within 3 months.'],src:['Reluctant Entertainer: freezer burritos','https://reluctantentertainer.com/freezer-burrito-recipe/']},
  prep_bowl:{n:'Chicken burrito bowls',t:'45 min',makes:['bowl',8],ing:[['chicken',1000],['onion',2],['pepper',2],['garlic',3],['fajita',2],['oil',15],['rice',500],['blackbeans',2],['tomatoes',1],['cheddar',160]],steps:['The night before, move the chicken to the fridge to defrost.','Dice the chicken, onions and peppers, and crush the garlic. Drain and rinse the beans.','Heat the oil in your biggest pan. Cook the onions and peppers 5 min, then the chicken with the fajita seasoning for 8–10 min until there’s no pink.','Add the garlic, beans and chopped tomatoes and simmer 5 min until thick.','Boil 500g rice for 10\u201312 min, drain, and split it across 8 freezer-safe containers. Spoon the chicken mix on top and add 20g cheese to each.','Let them cool, put the lids on and freeze. Best within 3 months.'],src:['Reluctant Entertainer: freezer burritos','https://reluctantentertainer.com/freezer-burrito-recipe/']}
};
var FSLOTS=[['bfast','Breakfast'],['am','Mid-morning'],['lunch','Lunch'],['pm','Afternoon'],['fuel','Before your run'],['dinner','Dinner']];
function slotsFor(plan){return FSLOTS.filter(function(s){return plan[s[0]];});}
var DINNERS=['d_honeychicken','d_salmon','d_pasta','d_beefbowl','d_bolognese','d_fajita','d_friedrice'];
function fTotals(ing){var k=0,p=0;ing.forEach(function(x){var it=FI[x[0]];var f=it.u==='each'?x[1]:x[1]/100;k+=it.k*f;p+=it.p*f;});return {k:k,p:p};}
['prep_burrito','prep_bowl'].forEach(function(r){var R=FR[r],t=fTotals(R.ing);FI[R.makes[0]].k=t.k/R.makes[1];FI[R.makes[0]].p=t.p/R.makes[1];});
function trainOn(ds){var key=iso(monday(parse(ds)));if(key<'2026-11-09')return {gym:null,run:null,key:key};var w=getWeek(key),p=w.plan[dayIdx(parse(ds))];return {gym:p.gym,run:p.run,key:key};}
function dayPlan(ds){
  var d=dayIdx(parse(ds)),t=trainOn(ds),sw=(state.food&&state.food.swaps)||{},p={bfast:'porridge',am:'banana_nuts',lunch:d<5?'freezer_lunch':'eggs_beans',pm:'pm_shake',fuel:t.run?'fuel':null,dinner:(sw[ds]&&FR[sw[ds]])?sw[ds]:DINNERS[d],dropped:[]};
  var tgt=fBurn(ds).target,tot=0,pro=0,tp=protTarget();
  FSLOTS.forEach(function(s){if(p[s[0]]){var nn=mealNut(p[s[0]],{burrito:1});tot+=nn.k;pro+=nn.p;}});
  ['am','pm'].forEach(function(sl){var nn=mealNut(p[sl],{burrito:1});if(tot-nn.k>=tgt-100&&pro-nn.p>=tp){p.dropped.push(sl);tot-=nn.k;pro-=nn.p;p[sl]=null;}});
  return p;
}
function sett(){var s0=state.settings||{};return {height:+s0.height||177.8,age:+s0.age||26,wfh:Array.isArray(s0.wfh)?s0.wfh:[false,false,false,false,false],protein:+s0.protein||140};}
function protTarget(){return sett().protein;}
/* Working from home on a given date: a one-off choice made on the Today page wins, otherwise the usual days from Settings. Weekends never count as a commute. */
function isWfh(ds){var d=dayIdx(parse(ds));if(d>=5)return true;var o=(state.settings||{}).wfhDays;if(o&&typeof o[ds]==='boolean')return o[ds];return !!sett().wfh[d];}
function fBurn(ds){
  var S=sett(),kg=bodyKg(),bmr=10*kg+6.25*S.height-5*S.age+5,base=bmr*1.3,d=dayIdx(parse(ds)),t=trainOn(ds),parts=[],burn=base;
  if(!isWfh(ds)){burn+=195;parts.push('cycling to work');}
  if(t.gym){burn+=t.gym==='legs'?280:250;parts.push(SESS[t.gym].name.toLowerCase()+' session');}
  if(t.run){var hv=t.run==='hard'?hardVariant(t.key):'long',hi2=t.run==='hard'?hardInfo(hv,t.key):null;burn+=t.run==='long'?Math.round(LONG_MIN[blockWeek(t.key)]*10.5):t.run==='easy'?Math.round(EASY_MIN[blockWeek(t.key)]*10.5):hv==='trial'?400:hv==='intervals'?180+50*hi2.reps:180+12.5*hi2.min;parts.push(t.run==='long'?'long run':t.run==='easy'?'easy run':hi2.title.toLowerCase());}
  extrasOn(ds).forEach(function(x){burn+=x.k;parts.push(x.n.toLowerCase());});
  var adj=(state.food&&state.food.adj)||0;
  return {burn:burn,parts:parts,adj:adj,target:Math.round((burn*1.07+adj)/50)*50};
}
function lunchPick(st){return (st.burrito||0)>=1?'burrito':(st.bowl||0)>=1?'bowl':null;}
var CARB={oats:1,rice:1,pasta:1,bread:1};
function carbScale(){return (state.food&&state.food.carb)||1;}
function mealIng(rid,st){
  if(rid==='freezer_lunch'){var w=lunchPick(st||{});return (w?[[w,1]]:[]).concat([['apple',1]]);}
  var cs=carbScale();
  if(cs===1||FR[rid].makes)return FR[rid].ing;
  return FR[rid].ing.map(function(x){return CARB[x[0]]?[x[0],FI[x[0]].u==='each'?Math.round(x[1]*cs*2)/2:Math.round(x[1]*cs)]:x;});
}
function mealNut(rid,st){
  if(rid==='freezer_lunch'){var w=lunchPick(st||{})||'burrito';return fTotals([[w,1],['apple',1]]);}
  return fTotals(mealIng(rid,st));
}
function servesFor(ds,slot){var F=state.food||{};return slot==='dinner'&&F.serves&&F.serves[ds]?F.serves[ds]:1;}
function mealIngDay(ds,slot,rid,st){var n=servesFor(ds,slot),ing=mealIng(rid,st);return n===1?ing:ing.map(function(x){return [x[0],x[1]*n];});}
function dayTotals(ds,plan,mk,st,mode){
  var F=food(),r={eatK:0,eatP:0,planK:0,planP:0};
  slotsFor(plan).forEach(function(s){var m=mk[s[0]];
    if(m&&m.s==='o'){r.eatK+=m.k||0;r.eatP+=m.p||0;r.planK+=m.k||0;r.planP+=m.p||0;return;}
    if(m&&m.s==='x')return;
    var n=mealNut(plan[s[0]],st);r.planK+=n.k;r.planP+=n.p;
    if(mode==='past'||(m&&m.s==='y')){r.eatK+=n.k;r.eatP+=n.p;}
  });
  ((F.extras||{})[ds]||[]).forEach(function(x){r.eatK+=x.k||0;r.eatP+=x.p||0;r.planK+=x.k||0;r.planP+=x.p||0;});
  return r;
}
/* automatic target adjustment from the bodyweight trend, checked every 2 weeks */
function autoAdjust(){
  var F=food(),ws=state.weights.slice().sort(function(a,b){return a.date<b.date?-1:1;}),today=todayD();
  if(ws.length<3)return false;
  if(F.adjAt&&(today-parse(F.adjAt))/864e5<14)return false;
  var from=iso(addDays(today,-35)),rec=ws.filter(function(w){return w.date>=from;});
  if(rec.length<3||(parse(rec[rec.length-1].date)-parse(rec[0].date))/864e5<21)return false;
  var reg=linreg(rec.map(function(w){return {t:parse(w.date).getTime(),y:+w.kg};}));if(!reg)return false;
  var perMonth=reg.perDay*30,delta=0,why='';
  if(perMonth<0.25){delta=150;why='Gaining '+(Math.round(perMonth*10)/10)+'kg a month, under the 0.25\u20131kg aim';}
  else if(perMonth>1){delta=-150;why='Gaining '+(Math.round(perMonth*10)/10)+'kg a month, faster than needed';}
  F.adjAt=iso(today);
  if(!delta)return true;
  var na=Math.max(-600,Math.min(900,(F.adj||0)+delta));if(na===(F.adj||0))return true;
  F.adj=na;F.carb=Math.max(0.6,Math.min(2,Math.round(((F.carb||1)+(delta>0?0.2:-0.2))*10)/10));
  (F.adjLog=F.adjLog||[]).push({d:iso(today),delta:delta,why:why});
  return true;
}
function food(){
  if(!state.food)state.food={start:'2026-11-16',ev:[],marks:{},preps:[],prepNext:'burrito',horizon:7,setup:false,target:{kcal:3100,p:140}};
  var F=state.food;['ev','preps'].forEach(function(k){if(!F[k])F[k]=[];});if(!F.marks)F.marks={};
  return F;
}

/* ---------- food: stock engine ---------- */
function fSim(){
  var F=food(),st={},last={},today=iso(todayD()),days={};
  function push(d,a){(days[d]=days[d]||[]).push(a);}
  function use(i,q){st[i]=Math.max(0,(st[i]||0)-q);}
  F.ev.forEach(function(e){push(e.d,{ts:e.ts,fn:function(){
    if(e.t==='set'){st[e.i]=e.q;if(e.q>0&&!last[e.i])last[e.i]=e.d;if(e.q<=0)delete last[e.i];}
    else{st[e.i]=(st[e.i]||0)+e.q;last[e.i]=e.d;}
  }});});
  F.preps.forEach(function(pr){push(pr.d,{ts:pr.ts,fn:function(){
    var R=FR[pr.r];R.ing.forEach(function(x){use(x[0],x[1]);});
    st[R.makes[0]]=(st[R.makes[0]]||0)+R.makes[1];last[R.makes[0]]=pr.d;
  }});});
  for(var d=parse(F.start);iso(d)<=today;d=addDays(d,1)){
    (function(ds){
      var plan=dayPlan(ds),mk=F.marks[ds]||{};
      slotsFor(plan).forEach(function(s){
        var m=mk[s[0]];
        if(m&&(m.s==='x'||m.s==='o'))return;
        if(ds===today&&!(m&&m.s==='y'))return;
        push(ds,{ts:m&&m.s==='y'?m.ts:Infinity,fn:function(){mealIngDay(ds,s[0],plan[s[0]],st).forEach(function(x){use(x[0],x[1]);});}});
      });
    })(iso(d));
  }
  Object.keys(days).sort().forEach(function(ds){
    if(ds>today)return;
    days[ds].sort(function(a,b){return a.ts===b.ts?0:a.ts<b.ts?-1:1;}).forEach(function(a){a.fn();});
  });
  return {st:st,last:last};
}
function fProject(H,sim){
  var F=food(),st=Object.assign({},(sim||fSim()).st),today=iso(todayD()),from=today<F.start?F.start:today;
  var need={},later={},preps=[],fl={burrito:st.burrito||0,bowl:st.bowl||0},pr=F.prepNext==='bowl'?'bowl':'burrito';
  function add(i,q,k,ds){
    var it=FI[i];if(it.made)return;
    var off=Math.round((parse(ds)-parse(today))/864e5);
    if(it.shelf&&off>=it.shelf){if(!later[i])later[i]={q:0,by:ds};later[i].q+=q;return;}
    need[i]=(need[i]||0)+q;
  }
  for(var k=0;k<H;k++){
    var ds=iso(addDays(parse(from),k)),plan=dayPlan(ds),mk=F.marks[ds]||{};
    slotsFor(plan).forEach(function(s){
      if(mk[s[0]])return;
      var rid=plan[s[0]];
      if(rid==='freezer_lunch'){
        add('apple',1,k,ds);
        if(fl.burrito>=1){fl.burrito--;return;}
        if(fl.bowl>=1){fl.bowl--;return;}
        var R=FR[pr==='bowl'?'prep_bowl':'prep_burrito'];
        var pd=iso(addDays(parse(ds),-1));if(pd<today)pd=today;
        preps.push({by:ds,day:pd,r:pr==='bowl'?'prep_bowl':'prep_burrito'});
        R.ing.forEach(function(x){add(x[0],x[1],k,pd);});
        fl[R.makes[0]]+=R.makes[1]-1;
        pr=pr==='bowl'?'burrito':'bowl';
        return;
      }
      mealIngDay(ds,s[0],rid,null).forEach(function(x){add(x[0],x[1],k,ds);});
    });
  }
  var short={};
  Object.keys(need).forEach(function(i){var s=need[i]-(st[i]||0);if(s>1e-6)short[i]=s;});
  Object.keys(later).forEach(function(i){var bought=short[i]?packsFor(i,short[i])*FI[i].pk:0,have=Math.max(0,(st[i]||0)+bought-(need[i]||0));later[i].q=Math.max(0,later[i].q-have);if(later[i].q<=1e-6)delete later[i];});
  return {need:need,short:short,later:later,preps:preps,st:st,from:from};
}
var F_DAILY=null;
function fDaily(){
  if(F_DAILY)return F_DAILY;var u={};
  for(var d=0;d<7;d++){var p=dayPlan(iso(addDays(parse(START),d)));slotsFor(p).forEach(function(s){mealIng(p[s[0]],{burrito:1}).forEach(function(x){u[x[0]]=(u[x[0]]||0)+x[1]/7;});});}
  F_DAILY=u;return u;
}
function fmtQ(i,q){
  var it=FI[i];
  if(it.u==='g')return q>=1000?(Math.round(q/100)/10)+'kg':Math.round(q)+'g';
  if(it.u==='ml')return q>=1000?(Math.round(q/100)/10)+'L':Math.round(q)+'ml';
  var n=Math.round(q*2)/2;var un=it.un||['',''];return n+' '+(n===1?un[0]:un[1]);
}
function packsFor(i,q){return Math.max(1,Math.ceil(q/FI[i].pk-1e-6));}
function packText(i,n){var it=FI[i];if(it.pk===1)return fmtQ(i,n);return n+' × '+it.pl;}
function useSoon(sim){
  var out=[],today=todayD();
  Object.keys(sim.st).forEach(function(i){
    var it=FI[i];if(!it||!it.shelf||!(sim.st[i]>0)||!sim.last[i])return;
    var left=it.shelf-Math.round((today-parse(sim.last[i]))/864e5);
    if(left<=2)out.push({i:i,left:left});
  });
  return out.sort(function(a,b){return a.left-b.left;});
}

/* ---------- food: views ---------- */
var CART=null;
function cart(){if(!CART){CART=LS.get('tp-cart')||{};}return CART;}
function saveCart(){LS.set('tp-cart',CART||{});}
function renderFood(){
  var F=food(),v=ui.foodView||'today',h='';
  h+='<div class="seg" role="group" aria-label="Food views">'+[['today','Day'],['week','Week'],['shop','Shopping'],['pantry','Pantry']].map(function(x){return '<button data-act="fview" data-v="'+x[0]+'" aria-pressed="'+(v===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>';
  if(v==='today')h+=renderFoodDay();
  else if(v==='week')h+=renderFoodWeek();
  else if(v==='shop')h+=renderShop();
  else h+=renderPantry();
  return h;
}
function nutRow(k,p,tk,tp){
  return '<div class="fbars"><div><div class="fbl"><span>Calories</span><b>'+Math.round(k).toLocaleString('en-GB')+'</b> / '+tk.toLocaleString('en-GB')+'</div><div class="gbar"><span style="width:'+Math.min(100,Math.round(k/tk*100))+'%"></span></div></div>'+
    '<div><div class="fbl"><span>Protein</span><b>'+Math.round(p)+'g</b> / '+tp+'g</div><div class="gbar"><span style="width:'+Math.min(100,Math.round(p/tp*100))+'%"></span></div></div></div>';
}
function weightAdvice(){
  var ws=state.weights.slice().sort(function(a,b){return a.date<b.date?-1:1;});
  if(ws.length<2)return 'Weigh in once or twice a week (Log › Weight).';
  var a=ws[0],b=ws[ws.length-1],days=(parse(b.date)-parse(a.date))/864e5;
  if(days<21)return 'Keep weighing in. The trend becomes useful after about 3 weeks.';
  var perMonth=(b.kg-a.kg)/days*30;
  if(perMonth<0.25)return 'Gaining about '+(Math.round(perMonth*10)/10)+'kg a month, which is slower than the aim.';
  if(perMonth>1)return 'Gaining about '+(Math.round(perMonth*10)/10)+'kg a month, faster than needed.';
  return 'Gaining about '+(Math.round(perMonth*10)/10)+'kg a month. That’s right on target.';
}
function plan0dinner(ds){var sw=(food().swaps||{})[ds];return sw||DINNERS[dayIdx(parse(ds))];}
function adjNote(){var F=food();if(!F.adj)return ' Targets adjust themselves every 2 weeks once you have 3 weeks of weigh-ins.';var l=(F.adjLog||[])[F.adjLog.length-1];return ' <b>Auto-adjusted '+(F.adj>0?'+':'')+F.adj+' kcal a day</b>'+(l?' (last change '+fmtS(l.d)+': '+l.why+')':'')+'. Rice, pasta, oats and bread portions are scaled \u00d7'+(F.carb||1)+' to match.';}
var XPRESETS=[['Light meal',550,30],['Normal meal',850,40],['Big meal or takeaway',1300,45],['Snack',250,8],['Pint of beer',200,2]];
function extraForm(ds,slot){
  return '<div class="xform"><div class="chips">'+XPRESETS.map(function(x,i){return '<button class="pill" data-act="fxpre" data-i="'+i+'">'+x[0]+' ~'+x[1]+'</button>';}).join('')+'</div>'+
    '<div class="row3"><label>What<input id="fx-n" placeholder="e.g. Nando\u2019s"></label><label>kcal<input id="fx-k" type="number" inputmode="numeric" min="0"></label><label>Protein g<input id="fx-p" type="number" inputmode="numeric" min="0"></label></div>'+
    '<div class="pe-act"><button class="btn" data-act="fxcancel">Cancel</button><button class="btn primary" data-act="fxsave" data-d="'+ds+'" data-s="'+slot+'">Save</button></div></div>';
}
function recipeExtra(R){return (R.tip?'<p class="rtip">'+R.tip+'</p>':'')+(R.src?'<p class="rsrc">Based on <a href="'+R.src[1]+'" target="_blank" rel="noopener">'+esc(R.src[0])+'</a>. Season with salt and pepper to taste.</p>':'<p class="rsrc">Season with salt and pepper to taste.</p>');}
function mealHTML(ds,slot,label,rid,mk,mode,st){
  var R=FR[rid],nut=mealNut(rid,st),m=mk[slot],state_=m?m.s:(mode==='past'?'y':''),ingL=mealIngDay(ds,slot,rid,st);
  var name=R.n;
  if(rid==='freezer_lunch'){var w=lunchPick(st);name=w==='bowl'?'Burrito bowl and an apple':w==='burrito'?'Freezer burrito and an apple':'Freezer lunch and an apple';}
  var ok='f-'+ds+'-'+slot;
  var h='<div class="meal'+(state_==='x'?' skipped':state_==='y'?' eaten':'')+'">'+
    '<div class="mhead"><span class="mslot">'+label+'</span><span class="num">'+Math.round(nut.k)+' kcal · '+Math.round(nut.p)+'g protein</span></div>'+
    '<details data-ok="'+ok+'"'+(openDetails[ok]?' open':'')+'><summary class="mname">'+esc(name)+'<small> '+R.t+'</small></summary>'+
    '<ul class="ing">'+ingL.map(function(x){return '<li><span>'+FI[x[0]].n.replace(/ \((frozen|keep frozen|made by you)\)/,'')+'</span><span class="num">'+fmtQ(x[0],x[1])+'</span></li>';}).join('')+'</ul>'+
    '<ol class="steps">'+R.steps.map(function(s){return '<li>'+s+'</li>';}).join('')+'</ol>'+recipeExtra(R)+'</details>';
  if(state_==='o')h+='<div class="hint" style="margin:0">Ate something else: about '+m.k+' kcal, '+m.p+'g protein. <button class="linkbtn" data-act="fmark" data-d="'+ds+'" data-s="'+slot+'" data-v="o">Undo</button></div>';
  else if(mode==='future'){
    h+='<div class="mact"><button class="mbtn'+(state_==='x'?' on-x':'')+'" data-act="fmark" data-d="'+ds+'" data-s="'+slot+'" data-v="x">'+(state_==='x'?'Skipping (undo)':'Won\u2019t have it')+'</button></div>';
  }else{
    h+='<div class="mact"><button class="mbtn'+(state_==='y'?' on-y':'')+'" data-act="fmark" data-d="'+ds+'" data-s="'+slot+'" data-v="y">\u2713 Had it</button>'+
      '<button class="mbtn'+(state_==='x'?' on-x':'')+'" data-act="fmark" data-d="'+ds+'" data-s="'+slot+'" data-v="x">\u2715 Skipped</button>'+
      '<button class="mbtn" data-act="fxopen" data-d="'+ds+'" data-s="'+slot+'">Ate something else</button></div>';
  }
  if(ui.fxOpen===ds+'|'+slot)h+=extraForm(ds,slot);
  if(slot==='dinner'&&state_!=='o'){
    var sv=servesFor(ds,'dinner'),cur=plan0dinner(ds);
    h+='<div class="mact mopts"><label class="sel">Swap for<select data-swap="'+ds+'">'+DINNERS.map(function(r){return '<option value="'+r+'"'+(r===cur?' selected':'')+'>'+esc(FR[r].n)+'</option>';}).join('')+'</select></label>'+
      '<button class="mbtn'+(sv===2?' on-y':'')+'" data-act="fserves" data-d="'+ds+'">'+(sv===2?'Cooking for 2 \u2713':'Cooking for 2?')+'</button></div>';
  }
  return h+'</div>';
}
function renderFoodDay(){
  var F=food(),today=iso(todayD()),ds=ui.foodDay||(today<F.start?F.start:today);
  if(ds<F.start)ds=F.start;
  var mode=ds<today?'past':ds===today?'today':'future',plan=dayPlan(ds),mk=F.marks[ds]||{};
  var sim=fSim(),st=sim.st,h='';
  var dd=parse(ds);
  h+='<div class="weeknav"><button class="iconbtn" data-act="fday" data-n="-1" aria-label="Previous day"'+(ds<=F.start?' disabled':'')+'>‹</button>'+
    '<div class="wk"><div class="range">'+DAYS[dayIdx(dd)]+' '+fmtD(dd)+'</div><div class="sub">'+(mode==='today'?'Today':mode==='past'?'Past day: log anything you skipped':'Coming up: mark meals you won’t have')+'</div></div>'+
    '<button class="iconbtn" data-act="fday" data-n="1" aria-label="Next day">›</button></div>';
  if(today<F.start)h+='<div class="notice">Your meal plan starts on <b>Monday 16 Nov</b>. Set up your <button class="linkbtn" data-act="fview" data-v="pantry">pantry</button>, then do your first <button class="linkbtn" data-act="fview" data-v="shop">shop</button>.</div>';
  var tt=dayTotals(ds,plan,mk,st,mode),eatK=tt.eatK,eatP=tt.eatP,planK=tt.planK,planP=tt.planP;
  var bn=fBurn(ds);
  h+='<div class="card">'+(mode==='future'?nutRow(planK,planP,bn.target,protTarget()):nutRow(eatK,eatP,bn.target,protTarget()))+
    (plan.dropped.length?'<div class="hint" style="margin:0 0 6px">Lighter day, so the '+plan.dropped.map(function(x){return x==='am'?'mid-morning snack':'afternoon shake';}).join(' and ')+' '+(plan.dropped.length>1?'are':'is')+' left out.</div>':'')+
    '<div class="hint" style="margin:0">Estimated burn '+(Math.round(bn.burn/10)*10).toLocaleString('en-GB')+' kcal ('+(bn.parts.length?bn.parts.join(', '):'rest day')+'), so the target is '+bn.target.toLocaleString('en-GB')+' with a small surplus. '+(mode==='future'?'Planned meals: ':'Planned: ')+Math.round(planK).toLocaleString('en-GB')+' kcal, '+Math.round(planP)+'g protein.'+(bn.target-planK>=250?' <b>That\u2019s about '+(Math.round((bn.target-planK)/50)*50)+' kcal short'+(extrasOn(ds).length?' because of the extra activity':'')+'.</b> Top up with '+(bn.target-planK>=450?'a larger dinner (an extra 50g of rice adds 175) and a banana with 30g of nuts':'a banana with 30g of nuts (about 300)')+', then tap \u201cAdd something else I ate\u201d.':'')+'</div></div>';
  if(mode==='today'||(today<F.start&&ds===F.start))h+=foodAlertsHTML(sim,F,st);
  if(mode!=='future'&&tt.eatK<bn.target-300&&mode==='past')h+='';
  var exs=(F.extras||{})[ds]||[];
  if(exs.length)h+='<div class="card"><b style="font-size:13px">Extras</b>'+exs.map(function(x){return '<div class="srow"><div class="smain"><div class="sname">'+esc(x.n)+'</div><div class="ssub">'+x.k+' kcal \u00b7 '+x.p+'g protein</div></div><button class="del" data-act="fxdel" data-d="'+ds+'" data-id="'+x.id+'">Remove</button></div>';}).join('')+'</div>';
  h+='<div class="hint" style="margin:6px 0 10px">Freezer: '+fmtQ('burrito',st.burrito||0)+', '+fmtQ('bowl',st.bowl||0)+'.</div>';
  h+='<div class="meals">'+slotsFor(plan).map(function(s){return mealHTML(ds,s[0],s[1],plan[s[0]],mk,mode,st);}).join('')+'</div>';
  h+=(ui.fxOpen===ds?extraForm(ds,'extra'):'<button class="btn sm" style="margin-top:10px" data-act="fxopen" data-d="'+ds+'">+ Add something else I ate</button>');
  var wk=0;for(var j=0;j<7;j++)wk+=fBurn(iso(addDays(monday(dd),j))).target;
  h+='<h2>Targets</h2><div class="card"><div class="hint" style="margin:0">Each day\u2019s target is your estimated burn plus about 7%, using that day\u2019s training from the Training tab, so it follows any sessions you move. This week averages <b>'+(Math.round(wk/7/10)*10).toLocaleString('en-GB')+' kcal</b>, with at least <b>'+protTarget()+'g protein</b>. The weekly average matters more than any single day. '+weightAdvice()+adjNote()+'</div></div>';
  return h;
}
function renderFoodWeek(){
  var F=food(),today=iso(todayD()),base=monday(parse(today<F.start?F.start:today)),off=ui.foodWeekOff||0,mon=addDays(base,7*off),h='';
  h+='<div class="weeknav"><button class="iconbtn" data-act="fweek" data-n="-1" aria-label="Previous week">‹</button><div class="wk"><div class="range">'+fmtD(mon)+' – '+fmtD(addDays(mon,6))+'</div><div class="sub">Tap a day to see or log its meals</div></div><button class="iconbtn" data-act="fweek" data-n="1" aria-label="Next week">›</button></div>';
  h+='<div class="days">';
  for(var d=0;d<7;d++){
    var ds=iso(addDays(mon,d)),plan=dayPlan(ds),mk=F.marks[ds]||{},k=0,p=0,sk=0;
    slotsFor(plan).forEach(function(s){var m=mk[s[0]];if(m&&m.s==='o'){k+=m.k||0;p+=m.p||0;return;}if(m&&m.s==='x'){sk++;return;}var n=mealNut(plan[s[0]],{burrito:1});k+=n.k;p+=n.p;});
    h+='<button class="fday'+(ds===today?' today':'')+(ds<F.start?' past':'')+'" data-act="fopen" data-d="'+ds+'"><span class="dname">'+DAYS[d]+'</span><span class="fdmain"><b>'+esc(FR[plan.dinner].n)+'</b><span>'+(plan.lunch==='freezer_lunch'?'Freezer lunch':esc(FR[plan.lunch].n))+(sk?' · '+sk+' skipped':'')+'</span></span><span class="num">'+Math.round(k).toLocaleString('en-GB')+' / '+fBurn(ds).target.toLocaleString('en-GB')+'<br>'+Math.round(p)+'g protein</span></button>';
  }
  h+='</div><p class="hint" style="margin-top:12px">Every day: porridge, banana and nuts, and a protein shake. Run days add toast and honey before the run, and there\u2019s nothing after dinner. Weekday lunches come from the freezer, and Sunday is prep day when you\u2019re running low. Numbers show planned / target kcal.</p>';
  return h;
}
function renderShop(){
  var F=food(),H=F.horizon||7,sim=fSim(),pj=fProject(H,sim),pj2=fProject(H*2,sim),c=cart(),h='';
  h+='<div class="chips" style="margin:2px 0 10px"><span class="hint" style="margin:0;align-self:center">Shop for:</span>'+[[3,'3 days'],[7,'1 week'],[14,'2 weeks']].map(function(x){return '<button class="pill'+(H===x[0]?' on':'')+'" data-act="fhoriz" data-h="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>';
  if(!F.setup)h+='<div class="notice">This list assumes your cupboards are empty. Do the quick <button class="linkbtn" data-act="fview" data-v="pantry">pantry check</button> first so it only lists what you need.</div>';
  if(pj.preps.length)h+='<p class="hint">Includes ingredients for '+pj.preps.map(function(p){return FR[p.r].n.toLowerCase()+' (make by '+DAYS[dayIdx(parse(p.day))]+')';}).join(' and ')+'.</p>';
  var ids=Object.keys(pj.short),opt=ids.filter(function(i){return FI[i].opt;});ids=ids.filter(function(i){return !FI[i].opt;});
  var low=Object.keys(pj2.short).filter(function(i){return !pj.short[i]&&!FI[i].shelf&&!FI[i].opt;});
  function row(i,q,sub){
    var n=c[i]!=null?c[i].n:packsFor(i,q),tick=c[i]&&c[i].t;
    return '<div class="srow'+(tick?' ticked':'')+'"><button class="stick" data-act="ftick" data-i="'+i+'" data-n="'+n+'" aria-pressed="'+!!tick+'" aria-label="Got '+esc(FI[i].n)+'">'+(tick?'✓':'')+'</button>'+
      '<div class="smain"><div class="sname">'+esc(FI[i].n)+'</div><div class="ssub">'+sub+'</div></div>'+
      '<div class="sstep"><button data-act="fpack" data-i="'+i+'" data-n="'+(n-1)+'" aria-label="Fewer">−</button><span>'+packText(i,FI[i].pk===1?n:n)+'</span><button data-act="fpack" data-i="'+i+'" data-n="'+(n+1)+'" aria-label="More">+</button></div></div>';
  }
  if(!ids.length)h+='<div class="empty">Nothing to buy for the next '+H+' days. You’re stocked up.</div>';
  FCATS.forEach(function(cat){
    var list=ids.filter(function(i){return FI[i].c===cat;});if(!list.length)return;
    h+='<h2>'+cat+'</h2><div class="card slist">'+list.map(function(i){return row(i,pj.short[i],'Need '+fmtQ(i,pj.need[i])+(pj.st[i]>0?', have '+fmtQ(i,pj.st[i]):''));}).join('')+'</div>';
  });
  var lat=Object.keys(pj.later);
  if(lat.length)h+='<h2>Buy later</h2><div class="card slist">'+lat.map(function(i){return '<div class="srow"><div class="smain"><div class="sname">'+esc(FI[i].n)+'</div><div class="ssub">'+fmtQ(i,pj.later[i].q)+' needed by '+DAYS[dayIdx(parse(pj.later[i].by))]+' '+fmtS(pj.later[i].by)+'. Buy within '+FI[i].shelf+' days of then so it’s fresh.</div></div></div>';}).join('')+'</div>';
  if(low.length)h+='<h2>Running low</h2><div class="card slist">'+low.map(function(i){return row(i,pj2.short[i],'Enough for now, runs out within '+H*2+' days');}).join('')+'</div>';
  if(opt.length)h+='<h2>Optional</h2><div class="card slist">'+opt.map(function(i){return row(i,pj.short[i],'5g a day with breakfast. Small but reliable boost to strength and muscle.');}).join('')+'</div>';
  var nt=Object.keys(c).filter(function(i){return c[i].t;}).length;
  h+='<div class="shopbar"><button class="btn" data-act="fcopy">Copy list</button><button class="btn primary" data-act="fbought"'+(nt?'':' disabled')+'>Add '+nt+' ticked to pantry</button></div>';
  return h;
}
function pStep(it){if(it.u==='each')return 1;var t=it.pk/20,c=[5,10,20,25,50,100],r=5;c.forEach(function(x){if(x<=t)r=x;});return r;}
function pUnit(it){return it.u==='each'?((it.un||['',''])[1]||'items'):it.u;}
function renderPantry(){
  var F=food(),sim=fSim(),st=sim.st,daily=fDaily(),h='',draft=ui.pantryDraft,flt=ui.pantryFilter||'all',srch=(ui.pantrySearch||'').toLowerCase();
  if(!F.setup){
    h+='<div class="notice"><b>Quick pantry check.</b> Tap anything you already have and set roughly how much. Skip what you don’t have. Tap <b>Save pantry</b> at the bottom when you’re done.</div>';
    if(!draft){draft={};ui.pantryDraft=draft;}
  }
  var us=useSoon(sim);
  if(us.length)h+='<div class="falerts">'+us.map(function(u){return '<div class="falert warn"><b>'+esc(FI[u.i].n)+': '+(u.left<0?'check it’s still OK':'use '+(u.left<=0?'today':u.left===1?'by tomorrow':'within 2 days'))+'</b><span>'+fmtQ(u.i,st[u.i])+' left.'+(FI[u.i].tip?' '+FI[u.i].tip:'')+'</span></div>';}).join('')+'</div>';
  h+='<div class="pfilter"><input type="search" id="pf-search" placeholder="Search" value="'+esc(ui.pantrySearch||'')+'" aria-label="Search pantry"><div class="chips">'+[['all','All'],['have','What I have'],['low','Need soon']].map(function(x){return '<button class="pill'+(flt===x[0]?' on':'')+'" data-act="fpfilter" data-v="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div></div>';
  var pj=flt==='low'?fProject(7,sim):null,shown=0;
  FCATS.forEach(function(cat){
    var list=Object.keys(FI).filter(function(i){
      var it=FI[i],q=draft&&draft[i]!=null?draft[i]:(st[i]||0);
      if(it.c!==cat)return false;
      if(flt==='have'&&!(q>0))return false;
      if(flt==='low'&&!(pj.short[i]))return false;
      return true;
    });
    if(!list.length)return;
    h+='<h2>'+cat+'</h2><div class="card slist">';
    list.forEach(function(i){
      var it=FI[i],q=draft&&draft[i]!=null?draft[i]:(st[i]||0),days=daily[i]?q/daily[i]:null,frac=Math.min(1,q/it.pk);
      var hidden=srch&&it.n.toLowerCase().indexOf(srch)<0;shown++;
      var sub=(q>0?fmtQ(i,q):'None')+(it.made?'':' · '+it.pl)+(!it.made&&days!=null&&q>0?' · ~'+Math.floor(days)+' day'+(Math.floor(days)===1?'':'s'):'')+(draft&&draft[i]!=null?' · not saved yet':'');
      h+='<div class="pitem" data-name="'+esc(it.n.toLowerCase())+'"'+(hidden?' hidden':'')+'><button class="prow" data-act="fpopen" data-i="'+i+'" aria-expanded="'+(ui.pantryEdit===i)+'"><span class="smain"><span class="sname">'+esc(it.n)+'</span><span class="ssub">'+sub+'</span><span class="gbar thin"><span style="width:'+Math.round(frac*100)+'%"></span></span></span><span class="pedit-ic">Edit</span></button>';
      if(ui.pantryEdit===i){
        var stp=pStep(it),chips;
        if(it.u==='each'&&it.pk===1)chips=[['set',0,'None'],['set',1,'1'],['set',2,'2'],['set',3,'3'],['set',4,'4'],['add',1,'+1']];
        else if(it.made)chips=[['set',0,'None'],['add',1,'+1'],['add',it.pk,'+'+it.pk+' (a batch)']];
        else chips=[['set',0,'None'],['set',it.pk/4,'¼'],['set',it.pk/2,'½'],['set',it.pk*3/4,'¾'],['set',it.pk,'Full '+it.pl],['add',it.pk,'+1 '+it.pl]];
        h+='<div class="pedit"><div class="pe-row"><button data-act="fpstep" data-d="'+(-stp)+'" aria-label="Less">−</button><label class="pe-in"><input id="pe-q" type="number" inputmode="decimal" min="0" step="any" value="'+(Math.round(q*10)/10)+'" aria-label="Amount of '+esc(it.n)+'"><span>'+pUnit(it)+'</span></label><button data-act="fpstep" data-d="'+stp+'" aria-label="More">+</button></div>'+
          '<div class="chips">'+chips.map(function(c){return '<button class="pill" data-act="fpq" data-m="'+c[0]+'" data-v="'+c[1]+'">'+c[2]+'</button>';}).join('')+'</div>'+
          '<div class="pe-act"><button class="btn" data-act="fpcancel">Cancel</button><button class="btn primary" data-act="fpsave" data-i="'+i+'">'+(F.setup?'Save':'Set')+'</button></div></div>';
      }
      h+='</div>';
    });
    h+='</div>';
  });
  if(!shown)h+='<div class="empty">'+(flt==='have'?'Nothing marked as in stock yet.':flt==='low'?'Nothing needed in the next week. You’re stocked up.':'No items.')+'</div>';
  if(!F.setup)h+='<div class="shopbar"><button class="btn primary" data-act="fsetupdone">Save pantry</button></div>';
  return h;
}

/* ---------- food: events ---------- */
function fEvent(t,i,q){food().ev.push({d:iso(todayD()),t:t,i:i,q:q,ts:Date.now()});}
document.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-act]');if(!b)return;
  var act=b.getAttribute('data-act');if(act.charAt(0)!=='f')return;
  var F=food();
  if(act==='fview'){ui.foodView=b.getAttribute('data-v');saveUi();render();window.scrollTo(0,0);return;}
  if(act==='fday'){var cur=ui.foodDay||(iso(todayD())<F.start?F.start:iso(todayD()));ui.foodDay=iso(addDays(parse(cur),+b.getAttribute('data-n')));if(ui.foodDay<F.start)ui.foodDay=F.start;saveUi();render();return;}
  if(act==='fweek'){ui.foodWeekOff=(ui.foodWeekOff||0)+(+b.getAttribute('data-n'));saveUi();render();return;}
  if(act==='fopen'){ui.foodDay=b.getAttribute('data-d');ui.foodView='today';saveUi();render();window.scrollTo(0,0);return;}
  if(act==='fmark'){
    var ds=b.getAttribute('data-d'),sl=b.getAttribute('data-s'),v=b.getAttribute('data-v');
    var mk=F.marks[ds]||(F.marks[ds]={}),cur2=mk[sl]?mk[sl].s:(ds<iso(todayD())?'y':'');
    if(cur2===v||(mk[sl]&&mk[sl].s===v))delete mk[sl];else mk[sl]={s:v,ts:Date.now()};
    if(!Object.keys(mk).length)delete F.marks[ds];
    render();save();return;
  }
  if(act==='fxopen'){var xs=b.getAttribute('data-s');ui.fxOpen=xs?b.getAttribute('data-d')+'|'+xs:b.getAttribute('data-d');render();var xn=document.getElementById('fx-n');if(xn){try{xn.focus({preventScroll:true});}catch(e){}}return;}
  if(act==='fxcancel'){ui.fxOpen=null;render();return;}
  if(act==='fxpre'){var pr0=XPRESETS[+b.getAttribute('data-i')],en=document.getElementById('fx-n');if(en&&!en.value)en.value=pr0[0];document.getElementById('fx-k').value=pr0[1];document.getElementById('fx-p').value=pr0[2];return;}
  if(act==='fxsave'){
    var xd=b.getAttribute('data-d'),xsl=b.getAttribute('data-s'),xk=num('fx-k'),xp=num('fx-p')||0,xnm=(document.getElementById('fx-n').value||'').trim()||'Something else';
    if(!xk||xk<=0){toast('Add the calories. A rough guess is fine, or tap a preset.');return;}
    if(xsl==='extra'){F.extras=F.extras||{};(F.extras[xd]=F.extras[xd]||[]).push({id:uid(),n:xnm,k:Math.round(xk),p:Math.round(xp)});}
    else{var xmk=F.marks[xd]||(F.marks[xd]={});xmk[xsl]={s:'o',k:Math.round(xk),p:Math.round(xp),n:xnm,ts:Date.now()};}
    ui.fxOpen=null;render();save();return;
  }
  if(act==='fxdel'){var dd0=b.getAttribute('data-d'),xid=b.getAttribute('data-id');if(F.extras&&F.extras[dd0]){F.extras[dd0]=F.extras[dd0].filter(function(x){return x.id!==xid;});if(!F.extras[dd0].length)delete F.extras[dd0];}render();save();return;}
  if(act==='fserves'){var sd=b.getAttribute('data-d');F.serves=F.serves||{};if(F.serves[sd])delete F.serves[sd];else F.serves[sd]=2;render();save();return;}
  if(act==='fprepdone'){F.preps.push({d:iso(todayD()),r:b.getAttribute('data-r'),ts:Date.now()});F.prepNext=b.getAttribute('data-r')==='prep_burrito'?'bowl':'burrito';render();save();toast('Nice. Freezer stocked.');return;}
  if(act==='fprepswap'){F.prepNext=F.prepNext==='bowl'?'burrito':'bowl';render();save();return;}
  if(act==='fhoriz'){F.horizon=+b.getAttribute('data-h');CART={};saveCart();render();save();return;}
  if(act==='ftick'){var c=cart(),i=b.getAttribute('data-i');if(c[i]&&c[i].t)c[i].t=false;else c[i]={n:+b.getAttribute('data-n'),t:true};saveCart();render();return;}
  if(act==='fpack'){var c2=cart(),i2=b.getAttribute('data-i'),n=Math.max(0,+b.getAttribute('data-n'));c2[i2]={n:n,t:c2[i2]?c2[i2].t:false};saveCart();render();return;}
  if(act==='fbought'){
    var c3=cart(),k=0;
    Object.keys(c3).forEach(function(i){if(c3[i].t&&c3[i].n>0&&FI[i]){fEvent('add',i,c3[i].n*FI[i].pk);k++;}});
    CART={};saveCart();render();save();toast(k+' item'+(k===1?'':'s')+' added to your pantry.');return;
  }
  if(act==='fcopy'){
    var pj=fProject(F.horizon||7),c4=cart(),lines=[];
    FCATS.forEach(function(cat){var l=Object.keys(pj.short).filter(function(i){return FI[i].c===cat&&!FI[i].opt;});if(!l.length)return;lines.push(cat.toUpperCase());l.forEach(function(i){var n=c4[i]?c4[i].n:packsFor(i,pj.short[i]);lines.push('- '+FI[i].n+': '+packText(i,n));});lines.push('');});
    var txt=lines.join('\n');
    try{navigator.clipboard.writeText(txt).then(function(){toast('Shopping list copied.');},function(){toast('Couldn\u2019t copy. Your browser blocked it.');});}catch(e){toast('Couldn\u2019t copy. Your browser blocked it.');}
    return;
  }
  if(act==='fset'){
    var i3=b.getAttribute('data-i'),q=Math.max(0,+b.getAttribute('data-q'));
    if(!F.setup&&ui.pantryDraft){ui.pantryDraft[i3]=q;saveUi();render();return;}
    fEvent('set',i3,q);render();save();return;
  }
  if(act==='fpopen'){var pi=b.getAttribute('data-i');ui.pantryEdit=ui.pantryEdit===pi?null:pi;saveUi();render();var el=document.getElementById('pe-q');if(el){try{el.focus({preventScroll:true});el.select();}catch(e){}}return;}
  if(act==='fpcancel'){ui.pantryEdit=null;saveUi();render();return;}
  if(act==='fpfilter'){ui.pantryFilter=b.getAttribute('data-v');ui.pantryEdit=null;saveUi();render();return;}
  if(act==='fpstep'||act==='fpq'){
    var inp=document.getElementById('pe-q');if(!inp)return;var cv=parseFloat(inp.value)||0,v=+b.getAttribute(act==='fpstep'?'data-d':'data-v');
    var nv=act==='fpstep'||b.getAttribute('data-m')==='add'?cv+v:v;inp.value=Math.max(0,Math.round(nv*10)/10);return;
  }
  if(act==='fpsave'){
    var si=b.getAttribute('data-i'),sv=Math.max(0,parseFloat((document.getElementById('pe-q')||{}).value)||0);
    ui.pantryEdit=null;
    if(!F.setup){if(!ui.pantryDraft)ui.pantryDraft={};ui.pantryDraft[si]=sv;saveUi();render();return;}
    fEvent('set',si,sv);saveUi();render();save();toast(FI[si].n+': '+(sv>0?fmtQ(si,sv):'none')+'.');return;
  }
  if(act==='fsetupdone'){
    var dr=ui.pantryDraft||{};Object.keys(dr).forEach(function(i){fEvent('set',i,dr[i]);});
    F.setup=true;ui.pantryDraft=null;render();save();toast('Pantry saved. Your shopping list is ready.');return;
  }
});

/* ---------- events ---------- */
function actLive(){var el=document.getElementById('ac-kcal');if(!el)return;var m=num('ac-min');el.innerHTML=m>0?'~'+actKcal({type:ui.actType,int:ui.actInt,min:m})+' <small>kcal on top of your normal day</small>':'\u2014 <small>kcal</small>';}
function fallbackCopy(t){try{var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();var r=document.execCommand('copy');ta.remove();return r;}catch(e){return false;}}
function setTab(t){ui.tab=t;saveUi();if(location.hash.slice(1)!==t){try{history.replaceState(null,'','#'+t);}catch(e){}}render();window.scrollTo(0,0);}
function num(id){var el=document.getElementById(id);if(!el)return null;var v=el.value.trim();return v===''?null:+v;}
function markDone(date,sid){var key=iso(monday(parse(date)));var w=ensureWeek(key);w.done[sid]=true;}

/* ---------- Strava: new runs from Strava are added to the log (see js/sync.js) ---------- */
var STRAVA_RUNS=[];
var HARD_TYPE={intervals:'Intervals',tempo:'Tempo',trial:'Time trial / race'};
function runSess(type){return type==='Long easy'?'long':type==='Easy'?'easy':(type==='Intervals'||type==='Tempo'||type==='Time trial / race')?'hard':null;}
/* Guess the run type: from the activity's name first, then what was planned that day, then Strava's own tags. */
function stravaType(a){
  var n=a.name||'';
  if(/parkrun|\brace\b|time ?trial|\bTT\b/i.test(n)||a.workout===1)return 'Time trial / race';
  if(/interval|\breps\b|\d\s*x\s*\d|track/i.test(n))return 'Intervals';
  if(/tempo|threshold/i.test(n))return 'Tempo';
  if(/\blong\b/i.test(n))return 'Long easy';
  if(/easy|recovery|shake ?out|jog/i.test(n))return 'Easy';
  var t=trainOn(a.date);
  if(t.run==='hard')return HARD_TYPE[hardVariant(t.key)]||'Tempo';
  if(t.run==='long')return 'Long easy';
  if(t.run==='easy')return 'Easy';
  if(a.workout===2)return 'Long easy';
  return 'Easy';
}
/* Adds Strava runs that aren't in the log yet. Returns true if anything was added. */
function stravaImport(){
  if(!STRAVA_RUNS.length)return false;
  var skip=(state.settings.stravaSkip)||[],have={},added=[];
  state.runs.forEach(function(r){if(r.strava)have[r.strava]=1;});
  STRAVA_RUNS.slice().sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(a){
    var sid=String(a.id);
    if(have[sid]||skip.indexOf(sid)>=0||!a.date||a.date<FIRST_DAY||!(a.km>0)||!(a.sec>0))return;
    /* already logged by hand (same day, distance within 10%)? link it instead of adding a copy */
    var dup=state.runs.filter(function(r){return !r.strava&&r.date===a.date&&Math.abs(r.km-a.km)<=a.km*0.1;})[0];
    if(dup){dup.strava=sid;have[sid]=1;added.push(null);return;}
    var type=stravaType(a),sess=runSess(type),key=iso(monday(parse(a.date))),w=getWeek(key);
    var planned=sess&&w.plan.some(function(p){return p.run===sess;})&&!(w.done&&w.done[sess]);
    var rob={id:uid(),date:a.date,type:type,km:Math.round(a.km*100)/100,sec:Math.round(a.sec),hr:a.hr||null,note:a.name||'',strava:sid};
    if(!planned)rob.extra=true;
    state.runs.push(rob);have[sid]=1;
    if(planned)markDone(a.date,sess);
    added.push(rob);
  });
  var shown=added.filter(Boolean);
  if(shown.length===1)toast('From Strava: '+shown[0].type+' run, '+shown[0].km+' km at '+fmtPace(shown[0].sec/shown[0].km)+'/km.');
  else if(shown.length>1)toast(shown.length+' runs added from Strava.');
  return added.length>0;
}
if(window.Strava)Strava.onRuns(function(list){
  STRAVA_RUNS=list;
  if(mode==='pending')return;
  if(stravaImport()){save();if(!isEditing())render();}
});

document.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-act]');if(!b)return;
  var act=b.getAttribute('data-act');
  if(act==='tab'){setTab(b.getAttribute('data-tab'));return;}
  if(act==='go'){var gk=b.getAttribute('data-k'),gv=b.getAttribute('data-v'),gs=b.getAttribute('data-sec');if(gk){ui.logKind=gk;ui.logDate=null;}if(gv){ui.foodView=gv;if(gv==='today')ui.foodDay=null;}if(gs==='checkin')ui.ciForm=true;setTab(b.getAttribute('data-tab'));if(gs){var se=document.getElementById('sec-'+gs);if(se)se.scrollIntoView({block:'start'});}return;}
  if(act==='acttype'||act==='actint'){
    if(act==='acttype')ui.actType=b.getAttribute('data-v');else ui.actInt=+b.getAttribute('data-v');saveUi();
    document.querySelectorAll('[data-act="'+act+'"]').forEach(function(x){var on=x===b;x.setAttribute('aria-pressed',on);if(act==='acttype')x.classList.toggle('on',on);});
    actLive();return;
  }
  if(act==='homedone'){
    var hd=b.getAttribute('data-d'),hh=b.getAttribute('data-h'),ex0=homeDone(hd,hh);
    if(ex0)state.activities=state.activities.filter(function(a){return a!==ex0;});
    else state.activities.push({id:uid(),date:hd,type:'home',hs:hh,min:HOME[hh].min,int:1});
    render();save();if(!ex0)toast(HOME[hh].n+' logged.');return;
  }
  if(act==='saveact'){
    var am=num('ac-min');if(!am||am<=0){document.getElementById('ac-err').textContent='Add how many minutes.';return;}
    var ao={id:uid(),date:document.getElementById('ac-date').value||iso(todayD()),type:ui.actType||'walk',min:Math.round(am),int:ui.actInt==null?1:ui.actInt,note:document.getElementById('ac-note').value.trim()};
    state.activities.push(ao);ui.logDate=null;render();save();toast((ACTS[ao.type]||ACTS.sport).n+' saved: about '+actKcal(ao)+' kcal added to '+(ao.date===iso(todayD())?'today':fmtS(ao.date))+'.');return;
  }
  if(act==='ciopen'){ui.ciForm=true;render();var cd=document.getElementById('sec-checkin');if(cd)cd.scrollIntoView({block:'start'});return;}
  if(act==='cicancel'){ui.ciForm=false;render();return;}
  if(act==='ciall'){ui.ciAll=!ui.ciAll;render();return;}
  if(act==='cisave'){
    var co={id:uid(),date:document.getElementById('ci-date').value||iso(todayD())},any=false;
    ['waist','chest','arm','thigh'].forEach(function(k){var v=num('ci-'+k);if(v&&v>0){co[k]=Math.round(v*10)/10;any=true;}});
    var cn=document.getElementById('ci-note').value.trim();if(cn){co.note=cn;any=true;}
    var pf=document.getElementById('ci-photo'),file=pf&&pf.files&&pf.files[0];
    if(!any&&!file){document.getElementById('ci-err').textContent='Add at least one measurement or a photo.';return;}
    var finish=function(){state.checkins.push(co);ui.ciForm=false;render();save();toast('Check-in saved.');};
    if(!file||!assetsNS){finish();return;}
    b.disabled=true;b.textContent='Uploading photo\u2026';
    shrinkImage(file).then(function(bl){return assetsNS.upload(bl);}).then(function(r){co.photo=r.id;finish();}).catch(function(){b.disabled=false;b.textContent='Save check-in';document.getElementById('ci-err').textContent='The photo didn\u2019t upload. Try again, or remove it and save the measurements.';});
    return;
  }
  if(act==='wfhtoday'){var wd=iso(todayD()),wo=Object.assign({},state.settings.wfhDays||{});wo[wd]=!isWfh(wd);state.settings.wfhDays=wo;render();save();toast(wo[wd]?'Marked as working from home.':'Marked as cycling to work.');return;}
  if(act==='stwfh'){var S0=sett(),wi=+b.getAttribute('data-i'),wf=S0.wfh.slice();wf[wi]=!wf[wi];state.settings.wfh=wf;render();save();return;}
  if(act==='stsave'){
    var hh=num('st-h'),ag=num('st-age'),pp=num('st-p'),er=document.getElementById('st-err');
    if(!hh||hh<120||hh>230){er.textContent='Height should be in cm, between 120 and 230.';return;}
    if(!ag||ag<14||ag>90){er.textContent='Check your age.';return;}
    if(!pp||pp<50||pp>300){er.textContent='Protein should be between 50 and 300g.';return;}
    var fm=num('st-fm'),fs=num('st-fs')||0,fsec=fm*60+fs,FS0=state.settings.fit5k||FIT_DEFAULT;
    if(!fm||fsec<12*60||fsec>45*60||fs>59){er.textContent='Your 5K should be between 12 and 45 minutes.';return;}
    if(fsec!==Math.round(FS0.sec))state.settings.fit5k={sec:fsec,date:iso(todayD())};
    state.settings.height=Math.round(hh*10)/10;state.settings.age=Math.round(ag);state.settings.protein=Math.round(pp);render();save();toast('Settings saved. Calorie targets and run paces updated.');return;
  }
  if(act==='stadjreset'){
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Tap again to reset';return;}
    var Fr=food();Fr.adj=0;Fr.carb=1;Fr.adjAt=iso(todayD());(Fr.adjLog=Fr.adjLog||[]).push({d:iso(todayD()),delta:0,why:'Reset by you'});render();save();toast('Adjustment reset.');return;
  }
  if(act==='bkdl'){
    if(!downloadsNS)return;
    downloadsNS.save({filename:'sub20-plan-backup-'+iso(todayD())+'.json',data:backupText()}).then(function(){toast('Backup saved.');}).catch(function(){toast('Backup not saved.');});return;
  }
  if(act==='bkcopy'){
    var txt=backupText();
    var ok=function(){toast('Backup copied. Paste it into a note or email to yourself.');};
    try{navigator.clipboard.writeText(txt).then(ok,function(){fallbackCopy(txt)?ok():toast('Couldn\u2019t copy on this device.');});}catch(e){fallbackCopy(txt)?ok():toast('Couldn\u2019t copy on this device.');}
    return;
  }
  if(act==='bkcancel'){RESTORE=null;render();return;}
  if(act==='bkrestore'){
    if(!RESTORE)return;
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Tap again to replace';return;}
    state=normalize(RESTORE.st);RESTORE=null;LS.set('tp-gymdraft',null);render();save();toast('Backup restored.');return;
  }
  if(act==='wk'){ui.weekKey=iso(addDays(parse(ui.weekKey),7*(+b.getAttribute('data-n'))));var fw=iso(monday(parse(FIRST_DAY)));if(ui.weekKey<fw)ui.weekKey=fw;saveUi();render();return;}
  if(act==='wk-now'){ui.weekKey=defaultWeekKey();saveUi();render();return;}
  if(act==='tog'){
    var key=ui.weekKey;if(startIdxFor(key)>=7)return;
    var w=ensureWeek(key),d=+b.getAttribute('data-d'),k=b.getAttribute('data-k');
    w.avail[d][k]=!w.avail[d][k];replan(key);render();save();
    toast(w.avail[d][k]?DAYS[d]+' '+(k==='gym'?'gym':'run')+' is back on. Week rearranged.':'No '+(k==='gym'?'gym':'run')+' on '+DAYS[d]+'. Week rearranged.');
    return;
  }
  if(act==='resetwk'){
    var w2=ensureWeek(ui.weekKey);w2.avail.forEach(function(a,i){if(i>=(w2.from||0)){a.gym=true;a.run=true;}});replan(ui.weekKey);render();save();toast('All days unblocked.');return;
  }
  if(act==='done'){
    var w3=ensureWeek(ui.weekKey),sid=b.getAttribute('data-sid');
    if(w3.done[sid])delete w3.done[sid];else w3.done[sid]=true;
    render();save();if(w3.done[sid])toast('Nice. Ticked off.');return;
  }
  if(act==='logit'){
    var s2=b.getAttribute('data-sid'),dd=+b.getAttribute('data-d');
    ui.logDate=iso(addDays(parse(ui.weekKey),dd));
    if(SESS[s2].kind==='gym'){ui.logKind='gym';ui.logSession=s2;}
    else{ui.logKind='run';ui.runType=s2==='long'?'Long easy':s2==='easy'?'Easy':hardInfo(hardVariant(ui.weekKey)).type;}
    setTab('log');return;
  }
  if(act==='lk'){ui.logKind=b.getAttribute('data-k');saveUi();render();return;}
  if(act==='usetargets'){
    var i=+b.getAttribute('data-ex'),exEl=b.closest('.ex'),name=exEl.getAttribute('data-name');
    var tp=tplFor(name),sg=tp?suggest(tp,(document.getElementById('lg-date')||{}).value):null;if(!sg||!sg.sets)return;
    var cont=exEl.querySelector('.sets');
    while(cont.children.length<sg.sets.length){cont.insertAdjacentHTML('beforeend',setRow(i,cont.children.length,null));}
    sg.sets.forEach(function(s,j){var we=document.getElementById('w-'+i+'-'+j),re=document.getElementById('r-'+i+'-'+j);if(we)we.value=Math.abs(r1(s.w));if(re)re.value=s.r;});
    captureDraft();toast('Targets filled in. Change any set you beat or missed.');
    return;
  }
  if(act==='addset'){
    var i2=+b.getAttribute('data-ex'),c2=b.closest('.ex').querySelector('.sets');
    c2.insertAdjacentHTML('beforeend',setRow(i2,c2.children.length,null));captureDraft();return;
  }
  if(act==='savegym'){
    var date=(document.getElementById('lg-date').value)||iso(todayD()),sid3=document.getElementById('lg-session').value;
    var exs=[];
    document.querySelectorAll('.ex').forEach(function(exEl){
      var i3=exEl.getAttribute('data-ex'),rows=exEl.querySelectorAll('.setrow'),sets=[];
      var asEl=document.getElementById('as-'+i3),assisted=!!(asEl&&asEl.checked);
      for(var j=0;j<rows.length;j++){
        var we=document.getElementById('w-'+i3+'-'+j),re=document.getElementById('r-'+i3+'-'+j);
        var wv=we.value.trim(),rv=re.value.trim();
        if(wv===''&&rv==='')continue;
        var wn=wv!==''?+wv:(we.placeholder!==''?+we.placeholder:0);
        wn=Math.abs(wn);if(assisted&&wn>0)wn=-wn;
        sets.push({w:wn,r:rv!==''?+rv:null});
      }
      var rirv=(document.getElementById('rir-'+i3)||{}).value;
      if(sets.length){var exo={name:exEl.getAttribute('data-name'),sets:sets};if(rirv!==''&&rirv!=null)exo.rir=+rirv;exs.push(exo);}
    });
    if(!exs.length){document.getElementById('lg-err').textContent='Add at least one set before saving.';return;}
    var wko={id:uid(),date:date,session:sid3,exercises:exs,note:document.getElementById('lg-note').value.trim()};if(isDeload(iso(monday(parse(date)))))wko.deload=true;
    state.workouts.push(wko);LS.set('tp-gymdraft',null);stopRest();
    markDone(date,sid3);ui.logDate=null;ui.logSession=null;
    render();save();toast(SESS[sid3].name+' saved and ticked off.');return;
  }
  if(act==='saverun'){
    var km=num('rn-km'),mn=num('rn-min')||0,sc=num('rn-sec')||0,sec=mn*60+sc;
    if(!km||km<=0||sec<=0){document.getElementById('rn-err').textContent='Add a distance and a time.';return;}
    var type=document.getElementById('rn-type').value,rdate=document.getElementById('rn-date').value||iso(todayD());
    var xr=document.getElementById('rn-extra'),isX=!!(xr&&xr.checked),rob={id:uid(),date:rdate,type:type,km:Math.round(km*100)/100,sec:sec,hr:num('rn-hr'),note:document.getElementById('rn-note').value.trim()};
    if(isX)rob.extra=true;
    state.runs.push(rob);
    if(!isX&&(type==='Intervals'||type==='Tempo'||type==='Time trial / race'))markDone(rdate,'hard');
    if(!isX&&type==='Long easy')markDone(rdate,'long');
    if(!isX&&type==='Easy')markDone(rdate,'easy');
    ui.logDate=null;ui.runType=null;
    render();save();toast(type+' saved: '+fmtPace(sec/km)+'/km.');return;
  }
  if(act==='savebw'){
    var kg=num('bw-kg');if(!kg||kg<=0){document.getElementById('bw-err').textContent='Enter your weight in kg.';return;}
    state.weights.push({id:uid(),date:document.getElementById('bw-date').value||iso(todayD()),kg:Math.round(kg*10)/10});
    ui.logDate=null;render();save();toast('Weight saved.');return;
  }
  if(act==='del'){
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Tap again';setTimeout(function(){if(b.isConnected){b.classList.remove('armed');b.textContent='Delete';}},3000);return;}
    var t=b.getAttribute('data-type'),id=b.getAttribute('data-id');
    if(t==='checkins'&&assetsNS){state.checkins.forEach(function(c){if(c.id===id&&c.photo){try{assetsNS.delete(c.photo).catch(function(){});}catch(e){}}});}
    /* a deleted Strava run stays deleted: remember it so it isn't added again */
    if(t==='runs'){state.runs.forEach(function(r){if(r.id===id&&r.strava){var sk=state.settings.stravaSkip||(state.settings.stravaSkip=[]);if(sk.indexOf(r.strava)<0)sk.push(r.strava);}});}
    state[t]=state[t].filter(function(x){return x.id!==id;});render();save();toast('Deleted.');return;
  }
  if(act==='histall'){ui.histAll=!ui.histAll;render();return;}
  if(act==='rir'){var ri=b.getAttribute('data-ex'),hv=document.getElementById('rir-'+ri),nv=b.getAttribute('data-v');if(!hv)return;hv.value=hv.value===nv?'':nv;
    document.querySelectorAll('[data-act="rir"][data-ex="'+ri+'"]').forEach(function(x){x.classList.toggle('on',hv.value!==''&&x.getAttribute('data-v')===hv.value);});captureDraft();return;}
  if(act==='rest'){var rv3=+b.getAttribute('data-v');if(rv3>0){if(REST.end>Date.now()){REST.end+=rv3*1000;tickRest();}else startRest(rv3);}else stopRest();return;}
  if(act==='discarddraft'){LS.set('tp-gymdraft',null);render();return;}
  if(act==='applyremote'){applyRemote();return;}
  if(act==='gooffline'){goOffline();return;}
  if(act==='gadd'){ui.goalForm={kind:'run'};render();return;}
  if(act==='gkind'){ui.goalForm={kind:b.getAttribute('data-k')};render();return;}
  if(act==='gcancel'){ui.goalForm=null;render();return;}
  if(act==='gedit'){ui.goalForm={id:b.getAttribute('data-id')};render();window.scrollTo(0,0);return;}
  if(act==='gkm'){var ki=document.getElementById('gf-km');if(ki){ki.value=b.getAttribute('data-km');ki.dispatchEvent(new Event('input',{bubbles:true}));}return;}
  if(act==='gsave'){
    var f=ui.goalForm,old=f.id?state.goals.filter(function(x){return x.id===f.id;})[0]:null,kind=old?old.kind:f.kind,ng;
    if(kind==='run'){
      var gk=num('gf-km'),gs=(num('gf-h')||0)*3600+(num('gf-m')||0)*60+(num('gf-s')||0);
      if(!gk||gk<=0||gs<=0){document.getElementById('gf-err').textContent='Add a distance and a target time.';return;}
      ng={kind:'run',km:Math.round(gk*100)/100,sec:gs};
      var prev=state.goals.filter(function(x){return x.kind==='run'&&x.km===ng.km&&x!==old;}).map(function(x){return x.sec;});
      ng.base=old&&old.km===ng.km&&old.base?old.base:(prev.length?Math.min.apply(null,prev.concat([ng.sec+60])):undefined);
    }else{
      var gx=document.getElementById('gf-ex').value,gw=num('gf-w')||0,gr=num('gf-r');
      if(!gr||gr<1){document.getElementById('gf-err').textContent='Add the number of reps.';return;}
      ng={kind:'lift',ex:gx,w:old&&old.w<0&&gw>0?-gw:gw,r:Math.round(gr)};
    }
    if(old){ng.id=old.id;ng.created=old.created;state.goals[state.goals.indexOf(old)]=ng;}
    else{ng.id=uid();ng.created=iso(todayD());state.goals.push(ng);}
    if(ng.base===undefined)delete ng.base;
    ui.goalForm=null;render();save();toast('Goal saved.');return;
  }
  if(act==='gdel'){
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Tap again';setTimeout(function(){if(b.isConnected){b.classList.remove('armed');b.textContent='Delete';}},3000);return;}
    var gid=b.getAttribute('data-id');state.goals=state.goals.filter(function(x){return x.id!==gid;});render();save();toast('Goal deleted.');return;
  }
  if(act==='gnext'){
    var og=state.goals.filter(function(x){return x.id===b.getAttribute('data-id');})[0];if(!og)return;
    var nx=nextGoals(og)[+b.getAttribute('data-i')].g;nx.id=uid();nx.created=iso(todayD());state.goals.push(nx);
    render();save();toast('Next goal set: '+goalTitle(nx));return;
  }
});
document.addEventListener('change',function(ev){
  var id=ev.target.id;
  if(id==='lg-session'){ui.logSession=ev.target.value;ui.logDate=document.getElementById('lg-date').value||null;saveUi();render();}
  else if(id==='lg-date'||id==='rn-date'||id==='bw-date'){ui.logDate=ev.target.value||null;saveUi();}
  else if(id==='rn-type'){ui.runType=ev.target.value;saveUi();}
  else if(id==='pg-ex'){ui.exercise=ev.target.value;saveUi();render();}
  else if(ev.target.classList&&ev.target.classList.contains('rtype')){
    /* change the type of a run that came from Strava */
    var rid=ev.target.getAttribute('data-id'),nt=ev.target.value;
    state.runs.forEach(function(r){if(r.id===rid){r.type=nt;var ss=runSess(nt);if(!r.extra&&ss)markDone(r.date,ss);}});
    render();save();toast('Changed to '+nt+'.');
  }
});
document.addEventListener('input',function(ev){
  if(/^gf-(km|h|m|s)$/.test(ev.target.id)){
    var gk=num('gf-km'),gs=(num('gf-h')||0)*3600+(num('gf-m')||0)*60+(num('gf-s')||0),pe=document.getElementById('gf-pace');
    if(pe)pe.textContent=gk>0&&gs>0?'That\u2019s '+fmtPace(gs/gk)+'/km'+(Math.abs(gk-5)>0.01?' (about '+fmtTime(riegel(gs,gk,5))+' for 5 km)':''):'';
    return;
  }
  if(!/^rn-(km|min|sec)$/.test(ev.target.id))return;
  var km=num('rn-km'),sec=(num('rn-min')||0)*60+(num('rn-sec')||0),el=document.getElementById('rn-pace');
  if(!el)return;
  if(km>0&&sec>0){var p=sec/km;el.innerHTML=fmtPace(p)+' <small>per km'+(km>=3?' · 5k equivalent '+fmtTime(sec*Math.pow(5/km,1.06)):'')+'</small>';}
  else el.innerHTML='— <small>per km</small>';
});
document.addEventListener('input',function(ev){if(ev.target.closest&&ev.target.closest('.gymform'))captureDraft();});
document.addEventListener('change',function(ev){
  var id=ev.target.id||'';
  if(/^r-\d+-\d+$/.test(id)&&ev.target.value!==''){var exEl=ev.target.closest('.ex');var nm=exEl?exEl.getAttribute('data-name'):'';startRest(COMPOUND[nm]?150:90);}
});
document.addEventListener('input',function(ev){
  if(ev.target.id!=='pf-search')return;var q=ev.target.value.toLowerCase();ui.pantrySearch=ev.target.value;
  document.querySelectorAll('.pitem').forEach(function(r){r.hidden=!!q&&r.getAttribute('data-name').indexOf(q)<0;});
});
document.addEventListener('input',function(ev){if(ev.target.id==='ac-min')actLive();});
document.addEventListener('change',function(ev){
  var t=ev.target;
  if(t.getAttribute&&t.getAttribute('data-swap')){var F=food(),ds=t.getAttribute('data-swap');F.swaps=F.swaps||{};if(t.value===DINNERS[dayIdx(parse(ds))])delete F.swaps[ds];else F.swaps[ds]=t.value;render();save();return;}
  if(t.id==='bk-file'&&t.files&&t.files[0]){
    var rd=new FileReader();
    rd.onload=function(){var msg=document.getElementById('bk-msg');try{var o=JSON.parse(rd.result),st0=o&&o.state?o.state:o;if(!st0||typeof st0!=='object'||!Array.isArray(st0.workouts)||!st0.weeks)throw 0;RESTORE={st:st0,when:o.exported?new Date(o.exported).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'an unknown date'};if(msg)msg.innerHTML=restoreSummary();}catch(e){RESTORE=null;if(msg)msg.innerHTML='<div class="err">That file isn\u2019t a backup from this app.</div>';}};
    rd.readAsText(t.files[0]);
  }
});
document.addEventListener('keydown',function(ev){if(ev.target.id==='pe-q'&&ev.key==='Enter'){var b=document.querySelector('[data-act="fpsave"]');if(b)b.click();}});
document.addEventListener('toggle',function(ev){var t=ev.target;if(t&&t.tagName==='DETAILS'&&t.getAttribute('data-ok')){openDetails[t.getAttribute('data-ok')]=t.open;}},true);
window.addEventListener('hashchange',function(){var h=location.hash.slice(1);if(TABS.indexOf(h)>=0&&h!==ui.tab){ui.tab=h;saveUi();render();}});
var rz=null;window.addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(function(){if(ui.tab==='progress')render();},200);});

render();
initPersistence();
})();
