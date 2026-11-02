const display=document.querySelector('#writing-timer');
const toggle=document.querySelector('#timer-toggle');
const reset=document.querySelector('#timer-reset');
const status=document.querySelector('#timer-status');
const key='wogb-writing-timer';
let state={duration:600000,remaining:600000,endsAt:null},audio=null;
try{const saved=JSON.parse(localStorage.getItem(key));const duration=saved?.duration||600000;if(Number.isFinite(duration)&&duration>=600000&&duration<=10800000&&Number.isFinite(saved?.remaining)&&saved.remaining>=0&&saved.remaining<=duration&&(saved.endsAt===null||Number.isFinite(saved.endsAt)))state={...saved,duration};}catch{}
const label=document.createElement('label');label.className='timer-duration';label.textContent='Minutes ';
const minutes=document.createElement('input');minutes.type='number';minutes.min='10';minutes.max='180';minutes.step='1';minutes.value=String(state.duration/60000);minutes.setAttribute('aria-label','Writing timer minutes, minimum 10');label.append(minutes);display.before(label);
function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
function remaining(){return state.endsAt===null?state.remaining:Math.max(0,state.endsAt-Date.now());}
function unlockAudio(){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;audio??=new Context();audio.resume().catch(()=>{});}catch{}}
function ring(){
 if(!audio)return;
 try{audio.resume().then(()=>{const at=audio.currentTime;for(let i=0;i<3;i++){const tone=audio.createOscillator(),gain=audio.createGain();tone.type='sine';tone.frequency.value=i===1?1046.5:783.99;gain.gain.setValueAtTime(0,at+i*.42);gain.gain.linearRampToValueAtTime(.22,at+i*.42+.015);gain.gain.exponentialRampToValueAtTime(.001,at+i*.42+.7);tone.connect(gain);gain.connect(audio.destination);tone.start(at+i*.42);tone.stop(at+i*.42+.75);tone.onended=()=>{tone.disconnect();gain.disconnect();};}}).catch(()=>{});}catch{}
}
function render(){const left=remaining();if(state.endsAt!==null&&left===0){state={...state,remaining:0,endsAt:null};save();ring();}const seconds=Math.ceil(left/1000);display.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;toggle.textContent=state.endsAt!==null?'Pause':left===0?'Start again':left<state.duration?'Resume':'Start';status.textContent=left===0?'Time’s up. You did it!':state.endsAt!==null?'Writing time.':'Ready when you are.';}
function setMinutes(){const value=Number(minutes.value);if(!Number.isInteger(value)||value<10||value>180){minutes.setCustomValidity('Choose 10 to 180 minutes.');minutes.reportValidity();return false;}minutes.setCustomValidity('');if(value*60000!==state.duration){state={duration:value*60000,remaining:value*60000,endsAt:null};save();render();}return true;}
minutes.addEventListener('input',()=>minutes.setCustomValidity(''));
minutes.addEventListener('change',setMinutes);
toggle.addEventListener('click',()=>{if(!setMinutes())return;unlockAudio();const left=remaining();state=state.endsAt!==null?{...state,remaining:left,endsAt:null}:{...state,remaining:left||state.duration,endsAt:Date.now()+(left||state.duration)};save();render();});
reset.addEventListener('click',()=>{if(!setMinutes())return;state={...state,remaining:state.duration,endsAt:null};save();render();});
setInterval(render,250);document.addEventListener('visibilitychange',render);render();
