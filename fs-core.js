(function () {
'use strict';

// ====== 檢查 ======
if (typeof THREE === 'undefined') {
  var er = document.createElement('div');
  er.id = 'err';
  er.style.cssText = 'position:fixed;inset:0;display:flex;background:#111;color:#f66;align-items:center;justify-content:center';
  er.textContent = 'Three.js 載入失敗';
  document.body.appendChild(er);
  return;
}

var D = window.FS_DATA;
var $ = function (id) { return document.getElementById(id); };

// ====== 狀態 ======
var S = {
  started: false, mode: 'pve', mapIdx: 0,
  hp: 100, maxHp: 100, armor: 50, maxArmor: 50,
  score: 0, kills: 0, enemyKills: 0,
  wave: 0, waveActive: false, waveCooldown: 0,
  currentSlot: 1,
  playerSlots: { 1:'rifle', 2:'pistol', 3:'fist', 4:'grenade' },
  slotState: {
    1: { ammo:30, reserve:240 }, 2: { ammo:12, reserve:96 },
    3: { cooldown:0 }, 4: { count:3, cooldown:0 }
  },
  yaw: 0, pitch: 0,
  velocityY: 0, onGround: true, eyeHeight: 1.7,
  jumpsRemaining: 2, spaceHeld: false,
  playerVel: null, // 稍後 new THREE.Vector3
  isDead: false, respawnAt: 0,
  reloading: false, reloadStart: 0, reloadDuration: 0,
  nextShotTime: 0, spreadAmount: 0.002, recoilPitch: 0, muzzleTimer: 0,
  scoped: false, fovTarget: 78,
  shakeAmount: 0,
  mods: { damageMul:1, reloadMul:1, speedMul:1, regenMul:1,
          magMul:1, absorbMul:0.6, grenadeMax:3, doubleJumpBonus:0 },
  keys: {}, mouseDown: false, rightDown: false,
  mouseScreenX: 0, mouseScreenY: 0,
  locked: false, useHover: false,
  shopOpen: false
};
S.playerVel = new THREE.Vector3();

// ====== 容器 ======
var walls = [], enemies = [], projectiles = [], particles = [];
var tracers = [], grenades = [], explosions = [], pickups = [];
var remotePlayers = {};
var bossActive = null;

// ====== 場景 ======
var scene, camera, renderer, canvas;
var worldGroup, sun, ambLight, hemi, rimLight;
var groundMesh, gridMesh;
var boxGeo = new THREE.BoxGeometry(1, 1, 1);
var wallMaterials = [];
var partGeo = new THREE.BoxGeometry(1, 1, 1);

// ====== 音效 ======
var actx = null;
function initAudio() {
  try {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch (e) {}
}
function tone(f1,f2,dur,vol,type,q){
  if (!actx) return;
  try{
    var t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain(),
        f=actx.createBiquadFilter();
    f.type='lowpass'; f.frequency.value=5000; f.Q.value=q||1;
    o.type=type||'square';
    o.frequency.setValueAtTime(f1,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,f2),t+dur);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(f); f.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t+dur+0.02);
  }catch(e){}
}
function noiseBurst(dur,vol,freq,q){
  if (!actx) return;
  try{
    var t=actx.currentTime,len=Math.floor(actx.sampleRate*dur),
        buf=actx.createBuffer(1,len,actx.sampleRate),
        d=buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    var src=actx.createBufferSource(); src.buffer=buf;
    var f=actx.createBiquadFilter(); f.type='bandpass';
    f.frequency.value=freq||900; f.Q.value=q||1.5;
    var g=actx.createGain();
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(f); f.connect(g); g.connect(actx.destination);
    src.start(t);
  }catch(e){}
}
var SFX = {
  rifle:function(){tone(280,60,0.08,0.09,'square',2);noiseBurst(0.05,0.13,1400);},
  pistol:function(){tone(360,70,0.11,0.11,'sawtooth',2);noiseBurst(0.07,0.15,1000);},
  shotgun:function(){tone(180,40,0.20,0.16,'square',3);noiseBurst(0.18,0.22,600);},
  sniper:function(){tone(220,50,0.28,0.18,'sawtooth',2);noiseBurst(0.20,0.20,500);},
  smg:function(){tone(320,80,0.05,0.07,'square',2);noiseBurst(0.04,0.10,1600);},
  punch:function(){tone(140,60,0.10,0.14,'square',2);noiseBurst(0.06,0.10,400);},
  empty:function(){tone(180,130,0.05,0.06,'square');},
  reload:function(){tone(180,420,0.10,0.05,'triangle');noiseBurst(0.03,0.04,2200);},
  hit:function(){tone(880,500,0.04,0.07,'sine');},
  headshot:function(){tone(1400,700,0.06,0.09,'sine');tone(2200,1100,0.05,0.05,'sine');},
  kill:function(){tone(660,200,0.18,0.10,'triangle');noiseBurst(0.10,0.08,500);},
  hurt:function(){tone(130,50,0.20,0.15,'sawtooth');noiseBurst(0.10,0.10,400);},
  enemyGun:function(){tone(230,70,0.06,0.028,'square');},
  buy:function(){tone(600,1100,0.10,0.07,'sine');tone(900,1500,0.10,0.04,'sine');},
  wave:function(){tone(400,800,0.25,0.08,'triangle');tone(500,1000,0.25,0.05,'sine');},
  boss:function(){tone(120,40,0.8,0.20,'sawtooth',2);tone(180,60,0.8,0.12,'square');},
  bossShot:function(){tone(150,40,0.15,0.10,'sawtooth',2);noiseBurst(0.12,0.14,400);},
  explode:function(){tone(90,30,0.55,0.22,'sawtooth',1);noiseBurst(0.50,0.28,250,0.8);},
  throwG:function(){tone(500,900,0.08,0.05,'triangle');},
  pickup:function(){tone(800,1200,0.10,0.08,'sine');tone(1200,1600,0.10,0.05,'sine');},
  switch:function(){tone(500,700,0.05,0.04,'triangle');}
};

// ====== HUD 元素（動態建立） ======
var H = {};

function buildHUD() {
  var html = '';
  html += '<div id="crosshair" class="hidden">' +
    '<div id="chT" style="width:2px;height:8px"></div>' +
    '<div id="chB" style="width:2px;height:8px"></div>' +
    '<div id="chL" style="width:8px;height:2px"></div>' +
    '<div id="chR" style="width:8px;height:2px"></div>' +
    '<div id="chDot"></div></div>';
  html += '<div id="hitmarker" class="hidden">✕</div>';
  html += '<div id="damage"></div>';
  html += '<div id="popups"></div>';
  html += '<div id="bars" class="hidden">' +
    '<div class="bar-row"><div class="bar-label">HP</div>' +
    '<div class="bar"><div id="hpFill" class="fill hp"></div>' +
    '<span id="hpText">100</span></div></div>' +
    '<div class="bar-row"><div class="bar-label">AP</div>' +
    '<div class="bar"><div id="apFill" class="fill ap"></div>' +
    '<span id="apText">50</span></div></div></div>';
  html += '<div id="ammo" class="hidden">' +
    '<div><span id="ammoCurrent">30</span><span id="ammoReserve">/240</span></div>' +
    '<div id="weaponName">突擊步槍</div>' +
    '<div id="reloadHint">裝填中…</div>' +
    '<div id="reloadBar"></div></div>';
  html += '<div id="weaponSlots" class="hidden"></div>';
  html += '<div id="grenadeHud">手榴彈 <b id="grenadeCount">3</b></div>';
  html += '<div id="stats" class="hidden">' +
    '<div class="map" id="mapNameEl">競技場</div>' +
    '<div>分數 <b id="scoreVal">0</b></div>' +
    '<div id="waveRow">第 <b id="waveVal">1</b> 波 · 剩餘 <b id="enemyVal">0</b></div>' +
    '<div class="gold" id="killVal">擊殺 0</div>' +
    '<div id="mpRow" class="hidden">對手擊殺 <b id="enemyKillsVal">0</b></div></div>';
  html += '<div id="minimapWrap" class="hidden"><canvas id="minimap" width="320" height="320"></canvas></div>';
  html += '<div id="waveMsg"></div>';
  html += '<div id="modeHint" class="hidden"></div>';
  html += '<div id="bossBar"><div id="bossName">BOSS</div>' +
    '<div id="bossBarBg"><div id="bossFill"></div></div></div>';
  html += '<div id="shop"><h2>升級終端</h2>' +
    '<div id="shopSub">可用分數 <b id="shopScore">0</b></div>' +
    '<div id="shopGrid"></div>' +
    '<div id="shopHint">點擊購買 · 1-9 快捷 · ENTER 開始下一波</div></div>';

  var div = document.createElement('div');
  div.innerHTML = html;
  while (div.firstChild) document.body.appendChild(div.firstChild);

  H = {
    crosshair:$('crosshair'), hitmarker:$('hitmarker'), damage:$('damage'),
    bars:$('bars'), ammo:$('ammo'), stats:$('stats'),
    minimap:$('minimapWrap'), weaponSlots:$('weaponSlots'),
    grenadeHud:$('grenadeHud'), modeHint:$('modeHint'),
    waveMsg:$('waveMsg'), bossBar:$('bossBar'), bossFill:$('bossFill'),
    bossName:$('bossName'),
    hpFill:$('hpFill'), hpText:$('hpText'), apFill:$('apFill'), apText:$('apText'),
    ammoCur:$('ammoCurrent'), ammoRes:$('ammoReserve'),
    weaponName:$('weaponName'), reloadHint:$('reloadHint'), reloadBar:$('reloadBar'),
    scoreVal:$('scoreVal'), waveVal:$('waveVal'), enemyVal:$('enemyVal'),
    killVal:$('killVal'), enemyKillsVal:$('enemyKillsVal'),
    mapNameEl:$('mapNameEl'), grenadeCount:$('grenadeCount'),
    waveRow:$('waveRow'), mpRow:$('mpRow'),
    chT:$('chT'), chB:$('chB'), chL:$('chL'), chR:$('chR'),
    mmCanvas:$('minimap'),
    shop:$('shop'), shopGrid:$('shopGrid'), shopScore:$('shopScore'),
    popups:$('popups')
  };
  H.mmCtx = H.mmCanvas.getContext('2d');
}

// ====== Three.js 初始化 ======
function initThree() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, innerWidth/innerHeight, 0.1, 900);
  camera.position.set(0, 1.7, 0);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    var er = document.createElement('div');
    er.id = 'err';
    er.style.display = 'flex';
    er.textContent = 'WebGL 無法啟動';
    document.body.appendChild(er);
    return false;
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  canvas = renderer.domElement;

  sun = new THREE.DirectionalLight(0xffd9a8, 1.15);
  sun.position.set(80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left=-160; sun.shadow.camera.right=160;
  sun.shadow.camera.top=160; sun.shadow.camera.bottom=-160;
  sun.shadow.camera.far=400;
  scene.add(sun);
  ambLight = new THREE.AmbientLight(0x8098b8, 0.42); scene.add(ambLight);
  hemi = new THREE.HemisphereLight(0x8ab0d8, 0x3a4a3a, 0.55); scene.add(hemi);
  rimLight = new THREE.DirectionalLight(0x88bbff, 0.35);
  rimLight.position.set(-60, 40, -80);
  scene.add(rimLight);

  worldGroup = new THREE.Group(); scene.add(worldGroup);
  return true;
}

// ====== 槍模型 ======
var gunGroup, gunParts = {}, muzzleSprite, muzzleLight;
var glowTex = (function(){
  var c = document.createElement('canvas'); c.width=c.height=128;
  var g = c.getContext('2d');
  var grad = g.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(255,255,230,1)');
  grad.addColorStop(0.25,'rgba(255,220,120,0.9)');
  grad.addColorStop(0.55,'rgba(255,140,40,0.45)');
  grad.addColorStop(1,'rgba(255,80,0,0)');
  g.fillStyle=grad; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
})();

function buildGun(key) {
  if (!gunGroup) {
    gunGroup = new THREE.Group();
    camera.add(gunGroup);
  }
  while (gunGroup.children.length) gunGroup.remove(gunGroup.children[0]);
  gunParts = {};
  var w = D.WEAPON_DATA[key] || D.WEAPON_DATA.rifle;

  if (w.type === 'melee') {
    var handMat = new THREE.MeshStandardMaterial({color:0x8a6a4a, roughness:0.8});
    var hL = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.18,0.30), handMat);
    hL.position.set(-0.30,-0.28,-0.45);
    var hR = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.18,0.30), handMat);
    hR.position.set(0.30,-0.28,-0.45);
    gunGroup.add(hL,hR);
    gunParts.handL = hL; gunParts.handR = hR;
    muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:glowTex, color:0xffaa66, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false }));
    muzzleSprite.scale.set(0.5,0.5,1);
    muzzleSprite.position.set(0,-0.28,-0.62);
    gunGroup.add(muzzleSprite);
    muzzleLight = new THREE.PointLight(0xffaa44,0,8,2);
    muzzleLight.position.copy(muzzleSprite.position);
    gunGroup.add(muzzleLight);
  } else if (w.type === 'grenade') {
    var gMat = new THREE.MeshStandardMaterial({color:0x2a4a2a, metalness:0.6, roughness:0.5});
    var gB = new THREE.Mesh(new THREE.SphereGeometry(0.14,12,10), gMat);
    gB.position.set(0.32,-0.28,-0.42);
    gunGroup.add(gB);
    gunParts.grenBody = gB;
    muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:glowTex, color:0x88ff88, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false }));
    muzzleSprite.scale.set(0.4,0.4,1);
    muzzleSprite.position.set(0.32,-0.28,-0.5);
    gunGroup.add(muzzleSprite);
    muzzleLight = new THREE.PointLight(0x88ff88,0,8,2);
    muzzleLight.position.copy(muzzleSprite.position);
    gunGroup.add(muzzleLight);
  } else {
    var bMat = new THREE.MeshStandardMaterial({
      color:w.bodyColor||0x1a1a1e, roughness:0.45, metalness:0.7});
    var gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.16,0.52), bMat);
    gunBody.position.set(0,0,-0.12);
    var barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035,0.035,w.barrelLen||0.42,10),
      new THREE.MeshStandardMaterial({color:0x2a2a30, roughness:0.35, metalness:0.85}));
    barrel.rotation.x = Math.PI/2;
    barrel.position.set(0,0.01,-0.55-((w.barrelLen||0.42)-0.42)*0.5);
    var mag = new THREE.Mesh(new THREE.BoxGeometry(0.09,0.22,0.10),
      new THREE.MeshStandardMaterial({color:0x222228, roughness:0.6, metalness:0.5}));
    mag.position.set(0,-0.17,-0.02); mag.visible = !!w.magVisible;
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.16,0.09), bMat);
    grip.position.set(0,-0.14,0.12); grip.rotation.x = -0.28;
    gunGroup.add(gunBody, barrel, mag, grip);
    gunParts.body = gunBody; gunParts.barrel = barrel;
    if (w.scope) {
      var sc = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.22,8),
        new THREE.MeshStandardMaterial({color:0x1a1a1e, roughness:0.4, metalness:0.8}));
      sc.rotation.x = Math.PI/2; sc.position.set(0,0.10,-0.30);
      gunGroup.add(sc); gunParts.scope = sc;
    }
    muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:glowTex, color:0xffcc66, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false }));
    muzzleSprite.scale.set(0.75,0.75,1);
    muzzleSprite.position.set(0.26,-0.19,-0.55-(w.barrelLen||0.42)-0.15);
    gunGroup.add(muzzleSprite);
    muzzleLight = new THREE.PointLight(0xffaa44,0,12,2);
    muzzleLight.position.copy(muzzleSprite.position);
    gunGroup.add(muzzleLight);
  }
  gunGroup.position.set(0.26,-0.22,-0.02);
}

// ====== 遠端玩家模型 ======
function buildRemotePlayer(color) {
  var g = new THREE.Group();
  var bMat = new THREE.MeshStandardMaterial({color:color, roughness:0.65, metalness:0.4});
  var aMat = new THREE.MeshStandardMaterial({color:color, roughness:0.5,
    metalness:0.6, emissive:color, emissiveIntensity:0.3});
  var vMat = new THREE.MeshBasicMaterial({color:0x00ddff});
  function box(w,h,d,x,y,z,m){var b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
    b.position.set(x,y,z); b.castShadow=true; g.add(b); return b;}
  var body = box(0.95,1.15,0.62, 0,1.28,0, bMat);
  box(0.72,0.42,0.3, 0,1.4,0.3, aMat);
  box(0.28,0.22,0.42, -0.55,1.62,0, aMat);
  box(0.28,0.22,0.42, 0.55,1.62,0, aMat);
  var head = box(0.56,0.56,0.56, 0,2.18,0, bMat);
  var visor = box(0.48,0.14,0.06, 0,2.2,0.30, vMat);
  box(0.24,0.86,0.24, -0.62,1.16,0, bMat);
  box(0.24,0.86,0.24, 0.62,1.16,0, bMat);
  box(0.28,0.75,0.28, -0.22,0.38,0, bMat);
  box(0.28,0.75,0.28, 0.22,0.38,0, bMat);
  g.userData.headParts = [head, visor];
  return g;
}

// ====== 敵人模型 ======
function makeEnemyGroup(type) {
  var g = new THREE.Group();
  var t = D.ENEMY_TYPES[type];
  var bMat = new THREE.MeshStandardMaterial({color:t.body, roughness:0.65, metalness:0.4});
  var aMat = new THREE.MeshStandardMaterial({color:t.armor, roughness:0.5,
    metalness:0.6, emissive:t.armor, emissiveIntensity:0.4});
  var vMat = new THREE.MeshBasicMaterial({color:t.visor});
  function box(w,h,d,x,y,z,m){var b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
    b.position.set(x,y,z); b.castShadow=true; g.add(b); return b;}
  box(0.95,1.15,0.62, 0,1.28,0, bMat);
  box(0.72,0.42,0.3, 0,1.4,0.3, aMat);
  box(0.28,0.22,0.42, -0.55,1.62,0, aMat);
  box(0.28,0.22,0.42, 0.55,1.62,0, aMat);
  var head = box(0.56,0.56,0.56, 0,2.18,0, bMat);
  var visor = box(0.48,0.14,0.06, 0,2.2,0.30, vMat);
  box(0.24,0.86,0.24, -0.62,1.16,0, bMat);
  box(0.24,0.86,0.24, 0.62,1.16,0, bMat);
  box(0.28,0.75,0.28, -0.22,0.38,0, bMat);
  box(0.28,0.75,0.28, 0.22,0.38,0, bMat);
  g.scale.setScalar(t.scale);
  g.userData = {
    type:type, bodyMat:bMat, armorMat:aMat, visorMat:vMat,
    headParts:[head, visor]
  };
  return g;
}

// ====== 波次系統 ======
function spawnEnemy(type, hpBonus, atX, atZ) {
  var t = D.ENEMY_TYPES[type];
  var g = makeEnemyGroup(type);
  var x, z, tries = 0;
  if (atX !== undefined) { x = atX; z = atZ; }
  else {
    var R = D.MAPS[S.mapIdx].arena - 3;
    do {
      x = (Math.random()-0.5)*R*2; z = (Math.random()-0.5)*R*2;
      tries++;
    } while (Math.hypot(x-camera.position.x, z-camera.position.z) < 30 && tries < 40);
  }
  g.position.set(x, 0, z);
  var baseHp = t.hp + hpBonus;
  g.userData.hp = baseHp;
  g.userData.maxHp = baseHp;
  g.userData.speed = t.speed + Math.random()*0.6;
  g.userData.fireInterval = t.fireInterval;
  g.userData.shootTimer = 1 + Math.random()*1.4;
  g.userData.hitFlash = 0;
  g.userData.strafePhase = Math.random()*Math.PI*2;
  g.userData.damage = t.damage;
  g.userData.bulletSpeed = t.bulletSpeed;
  g.userData.bulletColor = t.bulletColor;
  g.userData.score = t.score;
  g.userData.headMul = t.headMul;
  g.userData.isBoss = (type === 'boss');
  g.userData.bossSummonTimer = 5;
  g.userData.netId = Math.random().toString(36).slice(2,9);
  scene.add(g);
  enemies.push(g);
  if (type === 'boss') {
    bossActive = g;
    H.bossBar.classList.add('on');
    H.bossName.textContent = 'BOSS · 工業泰坦';
    H.bossFill.style.width = '100%';
    SFX.boss();
    showBigMsg('BOSS 出現！', '#ff5577', 52);
  }
  return g;
}

function startWave() {
  S.wave++;
  var isBossWave = (S.wave % 5 === 0);
  if (isBossWave) {
    spawnEnemy('boss', (S.wave-5)*200);
    var guards = Math.min(6, 3 + Math.floor(S.wave/5));
    for (var g=0; g<guards; g++) spawnEnemy('grunt', (S.wave-1)*12);
  } else {
    var grunts = 3 + Math.floor(S.wave*1.1);
    var fasts = S.wave >= 2 ? Math.floor(S.wave*0.4) : 0;
    var heavies = S.wave >= 4 ? Math.floor((S.wave-3)*0.35) : 0;
    var hpB = (S.wave-1)*14;
    for (var i=0; i<grunts; i++) spawnEnemy('grunt', hpB);
    for (var j=0; j<fasts; j++) spawnEnemy('fast', hpB);
    for (var k=0; k<heavies; k++) spawnEnemy('heavy', hpB*1.2);
    showBigMsg('第 ' + S.wave + ' 波', '#ff8844', 48);
  }
  S.waveActive = true;
  SFX.wave();
  updateScore();
}

// ====== HUD 更新 ======
function updateBars() {
  H.hpFill.style.width = Math.max(0, (S.hp/S.maxHp)*100) + '%';
  H.apFill.style.width = Math.max(0, (S.armor/S.maxArmor)*100) + '%';
  H.hpText.textContent = Math.max(0, Math.ceil(S.hp));
  H.apText.textContent = Math.max(0, Math.ceil(S.armor));
}
function updateAmmoHud() {
  var key = S.playerSlots[S.currentSlot];
  var w = D.WEAPON_DATA[key];
  if (w.type === 'gun') {
    var st = S.slotState[S.currentSlot];
    var mag = getMagSize(w);
    H.ammoCur.textContent = st.ammo;
    H.ammoRes.textContent = '/' + st.reserve;
    H.ammoCur.style.color = (st.ammo===0)?'#e74c3c':(st.ammo<=mag*0.25?'#f39c12':'#fff');
  } else if (w.type === 'melee') {
    H.ammoCur.textContent = '∞'; H.ammoRes.textContent = '';
    H.ammoCur.style.color = '#8cf';
  } else if (w.type === 'grenade') {
    H.ammoCur.textContent = S.slotState[4].count; H.ammoRes.textContent = '';
    H.ammoCur.style.color = '#8f8';
  }
  H.weaponName.textContent = w.name;
  renderWeaponSlots();
  H.grenadeCount.textContent = S.slotState[4].count;
}
function updateScore() {
  H.scoreVal.textContent = S.score;
  H.waveVal.textContent = Math.max(1, S.wave);
  H.enemyVal.textContent = enemies.length;
  H.killVal.textContent = '擊殺 ' + S.kills;
  H.enemyKillsVal.textContent = S.enemyKills;
}
function showBigMsg(text, color, size) {
  var el = H.waveMsg;
  el.textContent = text;
  el.style.color = color || '#fff';
  el.style.fontSize = (size||44) + 'px';
  el.style.opacity = 1;
  el.style.transform = 'translate(-50%,-50%) scale(1)';
  clearTimeout(showBigMsg._t);
  showBigMsg._t = setTimeout(function () {
    el.style.opacity = 0;
    el.style.transform = 'translate(-50%,-50%) scale(1.15)';
  }, 1500);
}
function flashDamage() {
  H.damage.style.boxShadow = 'inset 0 0 160px 40px rgba(220,20,20,0.8)';
  setTimeout(function () {
    H.damage.style.boxShadow = 'inset 0 0 0 0 rgba(200,0,0,0)';
  }, 80);
}
function spawnDamagePopup(pos, text, isHead) {
  try {
    var v = pos.clone().project(camera);
    if (v.z > 1) return;
    var el = document.createElement('div');
    el.className = 'popup' + (isHead?' head':'');
    el.textContent = text;
    el.style.left = ((v.x*0.5+0.5)*innerWidth) + 'px';
    el.style.top = ((-v.y*0.5+0.5)*innerHeight) + 'px';
    H.popups.appendChild(el);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 780);
  } catch (e) {}
}
function renderWeaponSlots() {
  H.weaponSlots.innerHTML = '';
  for (var s=1; s<=4; s++) {
    var w = D.WEAPON_DATA[S.playerSlots[s]];
    var slot = document.createElement('div');
    slot.className = 'wslot' + (s === S.currentSlot ? ' active' : '');
    slot.innerHTML = '<span class="wkey">' + s + '</span>' +
                     '<span class="wname">' + w.name + '</span>';
    H.weaponSlots.appendChild(slot);
  }
}
function getMagSize(w) { return Math.floor(w.magSize * S.mods.magMul); }

// ====== 地圖建構 ======
function buildMap(idx) {
  S.mapIdx = idx;
  var map = D.MAPS[idx];
  while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]);
  walls = []; pickups = [];
  scene.background = new THREE.Color(map.sky);
  scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);
  sun.color.setHex(map.lightSun);
  ambLight.color.setHex(map.lightAmb);

  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(700,700),
    new THREE.MeshStandardMaterial({color:map.ground, roughness:0.96}));
  groundMesh.rotation.x = -Math.PI/2;
  groundMesh.receiveShadow = true;
  worldGroup.add(groundMesh);

  gridMesh = new THREE.GridHelper(200,100,map.gridA,map.gridB);
  gridMesh.position.y = 0.02;
  gridMesh.material.opacity = 0.2;
  gridMesh.material.transparent = true;
  worldGroup.add(gridMesh);

  wallMaterials = map.matColors.map(function (c) {
    return new THREE.MeshStandardMaterial({color:c, roughness:0.85, metalness:0.15});
  });

  var A = map.arena;
  var wMat = new THREE.MeshStandardMaterial({color:map.matColors[0], roughness:0.9});
  var outer = [[0,-A,A*2+3,8,3],[0,A,A*2+3,8,3],[-A,0,3,8,A*2+3],[A,0,3,8,A*2+3]];
  for (var oi=0; oi<outer.length; oi++) {
    var ow = outer[oi];
    var m = new THREE.Mesh(boxGeo, wMat);
    m.scale.set(ow[2],ow[3],ow[4]);
    m.position.set(ow[0], ow[3]/2, ow[1]);
    m.castShadow = true; m.receiveShadow = true;
    worldGroup.add(m); walls.push(m);
  }
  for (var wi=0; wi<map.walls.length; wi++) {
    var wl = map.walls[wi];
    var wm = new THREE.Mesh(boxGeo, wallMaterials[wl[5] % wallMaterials.length]);
    wm.scale.set(wl[2],wl[3],wl[4]);
    wm.position.set(wl[0], wl[3]/2, wl[1]);
    wm.castShadow = true; wm.receiveShadow = true;
    worldGroup.add(wm); walls.push(wm);
  }
  H.mapNameEl.textContent = map.name + ' · ' + map.difficulty;
  spawnPickups();
}

// ====== 武器拾取點 ======
function makePickupMesh(key) {
  var w = D.WEAPON_DATA[key];
  var g = new THREE.Group();
  var bMat = new THREE.MeshStandardMaterial({color:0x223344, roughness:0.7,
    metalness:0.5, emissive:0x223344, emissiveIntensity:0.6});
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.7,0.15,12), bMat);
  base.position.y = 0.075; g.add(base);
  var iconMat = new THREE.MeshStandardMaterial({color:w.bodyColor||0x1a1a1e,
    roughness:0.5, metalness:0.7, emissive:w.bodyColor||0x1a1a1e, emissiveIntensity:0.4});
  var icon = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.25,0.9), iconMat);
  icon.position.y = 1.0; g.add(icon);
  g.userData.icon = icon;
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map:glowTex, color: w.slot===1?0x66ccff:0xffcc66, transparent:true,
    opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false }));
  glow.scale.set(1.6,1.6,1); glow.position.y = 1.0; g.add(glow);
  g.userData.glow = glow;
  var light = new THREE.PointLight(w.slot===1?0x66ccff:0xffcc66, 1.5, 6, 2);
  light.position.y = 1.0; g.add(light);
  return g;
}

function spawnPickups() {
  var A = D.MAPS[S.mapIdx].arena;
  var positions = [
    [-A*0.55, -A*0.55], [A*0.55, -A*0.55], [-A*0.55, A*0.55], [A*0.55, A*0.55],
    [0, -A*0.75], [0, A*0.75], [-A*0.75, 0], [A*0.75, 0]
  ];
  var pool1 = ['shotgun','sniper','smg','rifle'];
  var pool2 = ['revolver','machinepistol','pistol'];
  positions.sort(function(){ return Math.random() - 0.5; });
  for (var i=0; i<positions.length; i++) {
    var pos = positions[i];
    var key, slot;
    if (i < 5) { key = pool1[Math.floor(Math.random()*pool1.length)]; slot = 1; }
    else { key = pool2[Math.floor(Math.random()*pool2.length)]; slot = 2; }
    var mesh = makePickupMesh(key);
    mesh.position.set(pos[0], 0, pos[1]);
    mesh.userData.weaponKey = key;
    mesh.userData.slot = slot;
    mesh.userData.taken = false;
    worldGroup.add(mesh);
    pickups.push(mesh);
  }
}

function updatePickups(dt, now) {
  for (var i=0; i<pickups.length; i++) {
    var p = pickups[i];
    if (p.userData.taken) continue;
    if (p.userData.icon) {
      p.userData.icon.rotation.y += dt * 1.5;
      p.userData.icon.position.y = 1.0 + Math.sin(now*2+i)*0.15;
    }
    if (p.userData.glow) {
      p.userData.glow.material.opacity = 0.4 + Math.sin(now*3+i)*0.25;
    }
    var dx = camera.position.x - p.position.x;
    var dz = camera.position.z - p.position.z;
    if (dx*dx + dz*dz < 3.24) pickupWeapon(p);
  }
}
function pickupWeapon(p) {
  var key = p.userData.weaponKey;
  var slot = p.userData.slot;
  var w = D.WEAPON_DATA[key];
  if (S.playerSlots[slot] === key) return;
  S.playerSlots[slot] = key;
  if (w.type === 'gun') {
    S.slotState[slot] = { ammo: getMagSize(w), reserve: w.reserve };
  }
  p.userData.taken = true;
  p.visible = false;
  setTimeout(function () {
    p.userData.taken = false;
    p.visible = true;
  }, 12000);
  SFX.pickup();
  showBigMsg('拾取 ' + w.name, '#88ffaa', 26);
  if (S.currentSlot === slot) buildGun(key);
  updateAmmoHud();
}

// ====== 粒子 / 曳光 / 爆炸 ======
function spawnParticles(pos, color, count, power, sizeMul) {
  sizeMul = sizeMul || 1;
  for (var i=0; i<count; i++) {
    var sz = (0.05 + Math.random()*0.06) * sizeMul;
    var p = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({
      color:color, transparent:true, opacity:1}));
    p.scale.set(sz,sz,sz); p.position.copy(pos);
    p.userData = {
      vel: new THREE.Vector3(
        (Math.random()-0.5)*power,
        Math.random()*power*0.8+1.5,
        (Math.random()-0.5)*power),
      life: 0.5 + Math.random()*0.4,
      spin: (Math.random()-0.5)*16
    };
    scene.add(p); particles.push(p);
  }
}
function spawnTracer(from, to) {
  try {
    var geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color:0xffdd88, transparent:true, opacity:0.85,
      blending:THREE.AdditiveBlending, depthWrite:false }));
    scene.add(line); tracers.push({line:line, life:0.09});
  } catch (e) {}
}
function spawnExplosion(pos, radius, color) {
  color = color || 0xffaa44;
  var s = new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),
    new THREE.MeshBasicMaterial({color:color, transparent:true, opacity:0.9,
      blending:THREE.AdditiveBlending, depthWrite:false}));
  s.position.copy(pos); scene.add(s);
  explosions.push({mesh:s, life:0.45, maxLife:0.45});
  spawnParticles(pos, color, 40, 18, 1.5);
  spawnParticles(pos, 0xff4400, 25, 14, 1.8);
  var light = new THREE.PointLight(color, 20, 25, 2);
  light.position.copy(pos); light.position.y += 1;
  scene.add(light);
  explosions.push({light:light, life:0.4, maxLife:0.4});
}

// ====== 射擊 / 手榴彈 / 切槍 ======
var raycaster = new THREE.Raycaster();
var screenCenter = new THREE.Vector2(0, 0);

function switchSlot(n) {
  if (n === S.currentSlot) return;
  if (S.reloading) return;
  var key = S.playerSlots[n];
  if (!D.WEAPON_DATA[key]) return;
  S.currentSlot = n;
  buildGun(key);
  updateAmmoHud();
  if (D.WEAPON_DATA[key].doubleJump && S.onGround) S.jumpsRemaining = 2 + S.mods.doubleJumpBonus;
  S.scoped = false; S.fovTarget = 78;
  SFX.switch();
}

function startReload() {
  var key = S.playerSlots[S.currentSlot];
  var w = D.WEAPON_DATA[key];
  if (w.type !== 'gun') return;
  if (S.reloading) return;
  var st = S.slotState[S.currentSlot];
  if (st.ammo >= getMagSize(w)) return;
  if (st.reserve <= 0) return;
  S.reloading = true;
  S.reloadDuration = w.reloadTime * S.mods.reloadMul;
  S.reloadStart = performance.now()/1000;
  H.reloadHint.style.opacity = 1;
  SFX.reload();
}
function finishReload() {
  var key = S.playerSlots[S.currentSlot];
  var w = D.WEAPON_DATA[key];
  if (w.type !== 'gun') { S.reloading = false; return; }
  var st = S.slotState[S.currentSlot];
  var mag = getMagSize(w);
  var give = Math.min(mag - st.ammo, st.reserve);
  st.ammo += give; st.reserve -= give;
  S.reloading = false;
  H.reloadHint.style.opacity = 0;
  H.reloadBar.style.width = '0%';
  updateAmmoHud();
}

function shoot() {
  if (S.isDead) return;
  var now = performance.now()/1000;
  var key = S.playerSlots[S.currentSlot];
  var w = D.WEAPON_DATA[key];
  if (w.type === 'melee') { meleeAttack(); return; }
  if (w.type === 'grenade') return;

  var st = S.slotState[S.currentSlot];
  if (!st) return;
  if (S.reloading) return;
  if (now < S.nextShotTime) return;
  if (st.ammo <= 0) { SFX.empty(); S.nextShotTime = now + 0.2; startReload(); return; }

  st.ammo--;
  S.nextShotTime = now + w.fireRate;
  updateAmmoHud();
  if (SFX[w.sound]) SFX[w.sound]();

  if (muzzleSprite) {
    muzzleSprite.material.opacity = 0.95;
    muzzleSprite.material.rotation = Math.random()*Math.PI*2;
    var sc = (0.6 + Math.random()*0.4) * (w.pellets>1?1.6:1);
    muzzleSprite.scale.set(sc,sc,1);
  }
  if (muzzleLight) muzzleLight.intensity = (w.pellets>1?9:5) + Math.random()*3;
  S.muzzleTimer = 0.055;

  var recoilMul = S.scoped ? 0.4 : 1;
  S.pitch += w.recoil * recoilMul * (0.72 + Math.random()*0.55);
  S.yaw += (Math.random()-0.5) * w.recoil * recoilMul * 0.95;
  S.recoilPitch += w.recoil * 0.7;
  S.shakeAmount = Math.min(S.shakeAmount + w.recoil*(w.pellets>1?22:14), 0.15);
  S.spreadAmount = Math.min(S.spreadAmount + w.spread*(S.scoped?0.3:8), 0.08);

  // 引擎回調（給聯網模式用）
  if (FS.onShot) FS.onShot(key);

  var muzzleWorld = new THREE.Vector3();
  if (muzzleSprite) muzzleSprite.getWorldPosition(muzzleWorld);

  var targets = enemies.concat(walls);
  for (var rid in remotePlayers) {
    if (remotePlayers[rid].group) targets.push(remotePlayers[rid].group);
  }

  var hitEnemies = {};
  var hitRemote = false;

  for (var p=0; p<w.pellets; p++) {
    raycaster.setFromCamera(screenCenter, camera);
    var dir = raycaster.ray.direction.clone();
    var sp = S.scoped ? w.spread*0.3 : S.spreadAmount;
    dir.x += (Math.random()-0.5)*sp;
    dir.y += (Math.random()-0.5)*sp;
    dir.z += (Math.random()-0.5)*sp;
    dir.normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = w.range;

    var hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) {
      if (p === 0) {
        var end = camera.position.clone().addScaledVector(dir, w.range);
        spawnTracer(muzzleWorld, end);
      }
      continue;
    }
    var hit = hits[0];
    var hitPos = hit.point.clone();
    if (p === 0) spawnTracer(muzzleWorld, hitPos);

    var enemyRoot = null, remoteRoot = null;
    var node = hit.object;
    while (node) {
      if (enemies.indexOf(node) >= 0) { enemyRoot = node; break; }
      for (var rr in remotePlayers) {
        if (remotePlayers[rr].group === node) { remoteRoot = node; break; }
      }
      if (remoteRoot) break;
      node = node.parent;
    }

    if (enemyRoot) {
      var isHead = enemyRoot.userData.headParts.indexOf(hit.object) >= 0;
      var headMul = enemyRoot.userData.headMul || 2.6;
      var dmg = w.damage * S.mods.damageMul * (isHead?headMul:1);
      if (w.pellets > 1) {
        var dist = camera.position.distanceTo(hitPos);
        dmg *= Math.max(0.15, 1 - dist/w.range);
      }
      var eid = enemyRoot.userData.netId;
      hitEnemies[eid] = (hitEnemies[eid] || 0) + dmg;
      spawnParticles(hitPos, isHead?0xff4444:0xcc2222, isHead?8:5, isHead?6:4);
      if (p === 0) spawnDamagePopup(hitPos, Math.round(dmg), isHead);
    } else if (remoteRoot) {
      var isHead2 = remoteRoot.userData.headParts &&
                    remoteRoot.userData.headParts.indexOf(hit.object) >= 0;
      var dmg2 = w.damage * S.mods.damageMul * (isHead2?2.5:1);
      if (FS.onHitRemote) FS.onHitRemote(dmg2);
      hitRemote = true;
      spawnParticles(hitPos, 0x66aaff, 8, 5);
      if (p === 0) spawnDamagePopup(hitPos, Math.round(dmg2), isHead2);
    } else {
      spawnParticles(hitPos, 0xcccccc, 4, 3.5);
    }
  }

  for (var hid in hitEnemies) applyEnemyDamage(hid, hitEnemies[hid]);

  if (Object.keys(hitEnemies).length > 0 || hitRemote) {
    SFX.hit();
    H.hitmarker.style.opacity = 1;
    setTimeout(function(){ H.hitmarker.style.opacity = 0; }, 75);
  }
}

function applyEnemyDamage(enemyId, damage) {
  // 交給模式處理（PVE 本地、PVPVE 房主）
  if (FS.onEnemyHit) { FS.onEnemyHit(enemyId, damage); return; }
  // 預設：本地處理
  for (var i=enemies.length-1; i>=0; i--) {
    if (enemies[i].userData.netId === enemyId) {
      enemies[i].userData.hp -= damage;
      enemies[i].userData.hitFlash = 0.10;
      if (enemies[i].userData.hp <= 0) killEnemy(enemies[i], i);
      return;
    }
  }
}

function meleeAttack() {
  var now = performance.now()/1000;
  var w = D.WEAPON_DATA[S.playerSlots[3]];
  if (S.slotState[3].cooldown > now) return;
  S.slotState[3].cooldown = now + w.fireRate;
  SFX.punch();
  if (gunParts.handL) {
    gunParts.handL.position.z = -0.20;
    gunParts.handR.position.z = -0.20;
    setTimeout(function(){
      if (gunParts.handL) gunParts.handL.position.z = -0.45;
      if (gunParts.handR) gunParts.handR.position.z = -0.45;
    }, 80);
  }
  var fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  var hitAny = false;
  for (var i=enemies.length-1; i>=0; i--) {
    var e = enemies[i];
    var dx = e.position.x - camera.position.x;
    var dz = e.position.z - camera.position.z;
    var d = Math.hypot(dx, dz);
    if (d > w.range) continue;
    var dir2 = new THREE.Vector3(dx, 0, dz).normalize();
    if (fwd.dot(dir2) < 0.5) continue;
    var dmg = w.damage * S.mods.damageMul;
    applyEnemyDamage(e.userData.netId, dmg);
    spawnParticles(e.position.clone().setY(1.4), 0xff6666, 10, 5);
    spawnDamagePopup(e.position.clone().setY(1.6), Math.round(dmg), false);
    hitAny = true;
  }
  for (var rid in remotePlayers) {
    var rp = remotePlayers[rid];
    if (!rp.group) continue;
    var dx2 = rp.group.position.x - camera.position.x;
    var dz2 = rp.group.position.z - camera.position.z;
    var d2 = Math.hypot(dx2, dz2);
    if (d2 > w.range) continue;
    if (fwd.dot(new THREE.Vector3(dx2,0,dz2).normalize()) < 0.5) continue;
    if (FS.onHitRemote) FS.onHitRemote(w.damage * S.mods.damageMul);
    hitAny = true;
  }
  if (hitAny) {
    SFX.hit();
    H.hitmarker.style.opacity = 1;
    setTimeout(function(){ H.hitmarker.style.opacity = 0; }, 75);
  }
}

function throwGrenade() {
  if (S.isDead) return;
  var now = performance.now()/1000;
  var st = S.slotState[4];
  if (st.count <= 0 || st.cooldown > now) return;
  st.count--;
  st.cooldown = now + D.WEAPON_DATA.grenade.cooldown;
  updateAmmoHud();
  SFX.throwG();
  if (gunParts.grenBody) {
    gunParts.grenBody.visible = false;
    setTimeout(function(){ if(gunParts.grenBody) gunParts.grenBody.visible = true; }, 400);
  }
  var g = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),
    new THREE.MeshStandardMaterial({color:0x2a4a2a, metalness:0.6, roughness:0.5}));
  var dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  g.position.copy(camera.position).addScaledVector(dir, 0.6);
  g.position.y -= 0.15;
  g.userData = {
    vel: new THREE.Vector3(dir.x*18, dir.y*14+4, dir.z*18),
    fuse: D.WEAPON_DATA.grenade.fuse,
    owner: 'local'
  };
  scene.add(g); grenades.push(g);
  if (FS.onGrenadeThrown) FS.onGrenadeThrown(g);
}

function killEnemy(e, idx) {
  var isBoss = e.userData.isBoss;
  var center = e.position.clone().setY(1.2 * (e.scale.x||1));
  spawnParticles(center, 0xff5533, isBoss?80:26, isBoss?22:10, isBoss?2:1);
  scene.remove(e);
  enemies.splice(idx, 1);
  S.score += e.userData.score || 100;
  S.kills++;
  SFX.kill();
  updateScore();
  if (isBoss) {
    bossActive = null;
    H.bossBar.classList.remove('on');
    showBigMsg('BOSS 擊殺！', '#f5c542', 54);
    spawnExplosion(e.position.clone().setY(2), 4);
    setTimeout(function(){ spawnExplosion(e.position.clone().setY(3), 3); }, 200);
    setTimeout(function(){ spawnExplosion(e.position.clone().setY(1), 3.5); }, 400);
    S.score += 2000;
  }
  if (FS.onEnemyKilled) FS.onEnemyKilled(e);
}

// ====== 傷害 / 重生 ======
function applyDamage(amount) {
  if (S.isDead) return;
  if (S.armor > 0) {
    var ab = Math.min(S.armor, amount * S.mods.absorbMul);
    S.armor -= ab; amount -= ab;
  }
  S.hp -= amount;
  flashDamage(); SFX.hurt();
  S.shakeAmount = Math.min(S.shakeAmount + 0.07, 0.15);
  updateBars();
  if (S.hp <= 0) {
    S.hp = 0; S.isDead = true;
    S.respawnAt = performance.now()/1000 + 3;
    showBigMsg('陣亡', '#f55', 46);
    if (FS.onPlayerDeath) FS.onPlayerDeath();
    if (S.mode === 'pve' || S.mode === 'pvpve') {
      S.score = Math.max(0, S.score - 300);
    }
    updateScore();
  }
}
function respawnPlayer() {
  S.isDead = false;
  S.hp = S.maxHp; S.armor = S.maxArmor;
  var spawns = [{x:0,z:0},{x:-20,z:0},{x:20,z:0},{x:0,z:-20},{x:0,z:20}];
  var best = spawns[0], bestD = -1;
  for (var i=0; i<spawns.length; i++) {
    var d = 999;
    for (var j=0; j<enemies.length; j++) {
      var dd = Math.hypot(spawns[i].x-enemies[j].position.x, spawns[i].z-enemies[j].position.z);
      d = Math.min(d, dd);
    }
    if (d > bestD) { bestD = d; best = spawns[i]; }
  }
  camera.position.set(best.x, 1.7, best.z);
  S.eyeHeight = 1.7; S.velocityY = 0;
  S.playerVel.set(0,0,0); S.onGround = true;
  S.jumpsRemaining = (S.playerSlots[3]==='fist') ? (2 + S.mods.doubleJumpBonus) : 1;
  updateBars();
}

// ====== 商店 ======
var shopCards = [];
function renderShop() {
  H.shopGrid.innerHTML = ''; shopCards = [];
  H.shopScore.textContent = S.score;
  D.UPGRADES.forEach(function (u, i) {
    var cost = upgradeCost(u);
    var maxed = (u.level >= u.max);
    var canAfford = (S.score >= cost);
    var card = document.createElement('div');
    card.className = 'upgrade';
    if (maxed) card.className += ' maxed';
    else if (!canAfford) card.className += ' disabled';
    var pips = '';
    for (var p=0; p<u.max; p++) {
      var cls = p < u.level ? (maxed?'onGold':'on') : '';
      pips += '<span class="' + cls + '"></span>';
    }
    card.innerHTML =
      '<div class="u-key">' + (i+1) + '</div>' +
      '<div class="u-body">' +
        '<div class="u-name">' + u.name + '</div>' +
        '<div class="u-desc">' + u.desc + '</div>' +
        '<div class="u-level">Lv ' + u.level + ' / ' + u.max + '</div>' +
        '<div class="u-pips">' + pips + '</div>' +
      '</div>' +
      (maxed ? '<div class="u-cost maxedTag">MAX</div>'
             : '<div class="u-cost' + (canAfford?'':' cant') + '">' + cost + '</div>');
    if (!maxed && canAfford) {
      card.addEventListener('click', function(){ buyUpgrade(i); });
    }
    H.shopGrid.appendChild(card);
    shopCards.push(card);
  });
}
function upgradeCost(u) { return Math.round(u.baseCost * (1 + u.level*0.65)); }
function buyUpgrade(i) {
  var u = D.UPGRADES[i];
  if (!u || u.level >= u.max) return;
  var cost = upgradeCost(u);
  if (S.score < cost) return;
  S.score -= cost; u.level++;
  u.apply();
  SFX.buy();
  updateBars(); updateAmmoHud(); updateScore(); renderShop();
  var card = shopCards[i];
  if (card) {
    card.style.transform = 'scale(1.03)';
    card.style.borderColor = 'rgba(120,200,255,0.9)';
    setTimeout(function(){
      card.style.transform = ''; card.style.borderColor = '';
    }, 150);
  }
}
function openShop() {
  S.shopOpen = true;
  if (document.exitPointerLock) document.exitPointerLock();
  H.shop.style.display = 'flex';
  if (canvas) canvas.style.cursor = 'default';
  renderShop();
  showBigMsg('升級終端', '#6cf', 34);
}
function closeShop() {
  S.shopOpen = false;
  H.shop.style.display = 'none';
  if (canvas) canvas.style.cursor = 'none';
  if (S.started && !S.useHover) {
    try {
      var p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(function(){ enableHoverMode(); });
    } catch (e) { enableHoverMode(); }
  }
  startWave();
}

// ====== 輸入 ======
function rotate(dx, dy) {
  var sens = S.scoped ? 0.0008 : 0.0021;
  S.yaw -= dx * sens;
  S.pitch -= dy * sens;
  var lim = Math.PI/2 - 0.02;
  S.pitch = Math.max(-lim, Math.min(lim, S.pitch));
}
function enableHoverMode() {
  if (S.useHover) return;
  S.useHover = true;
  if (canvas) canvas.style.cursor = 'none';
  H.modeHint.classList.remove('hidden');
  H.modeHint.textContent = '🎯 滑鼠移到畫面邊緣轉視角 · 左鍵射擊 · 右鍵狙擊 · G 手榴彈';
}

function setupInput() {
  document.addEventListener('mousemove', function (e) {
    S.mouseScreenX = e.clientX;
    S.mouseScreenY = e.clientY;
    if (S.shopOpen) return;
    if (S.locked) rotate(e.movementX||0, e.movementY||0);
  });
  document.addEventListener('mousedown', function (e) {
    if (!S.started || S.shopOpen) return;
    if (e.button === 0) {
      S.mouseDown = true;
      if (S.currentSlot === 4) throwGrenade();
      else shoot();
    } else if (e.button === 2) {
      S.rightDown = true;
      if (D.WEAPON_DATA[S.playerSlots[S.currentSlot]].scope) {
        S.scoped = true; S.fovTarget = 24;
      }
    }
  });
  document.addEventListener('mouseup', function (e) {
    if (e.button === 0) S.mouseDown = false;
    if (e.button === 2) { S.rightDown = false; S.scoped = false; S.fovTarget = 78; }
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('wheel', function (e) {
    if (!S.started || S.shopOpen) return;
    var dir = e.deltaY > 0 ? 1 : -1;
    var next = ((S.currentSlot - 1 + dir + 4) % 4) + 1;
    switchSlot(next);
  }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (S.keys[e.code]) return;
    S.keys[e.code] = true;
    if (S.shopOpen) {
      if (e.code === 'Enter') { closeShop(); return; }
      if (e.code.indexOf('Digit') === 0) {
        var n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= D.UPGRADES.length) buyUpgrade(n - 1);
      }
      return;
    }
    if (!S.started) return;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') throwGrenade();
    if (e.code === 'Digit1') switchSlot(1);
    if (e.code === 'Digit2') switchSlot(2);
    if (e.code === 'Digit3') switchSlot(3);
    if (e.code === 'Digit4') switchSlot(4);
    if (e.code === 'KeyQ') switchSlot(S.currentSlot === 1 ? 2 : 1);
  });
  document.addEventListener('keyup', function (e) { S.keys[e.code] = false; });
  window.addEventListener('blur', function () {
    S.keys = {}; S.mouseDown = false; S.rightDown = false;
  });

  document.addEventListener('pointerlockchange', function () {
    S.locked = (document.pointerLockElement === canvas);
    if (S.locked) {
      S.useHover = false;
      if (canvas) canvas.style.cursor = 'none';
      H.modeHint.textContent = 'ESC 釋放滑鼠';
    } else if (S.started && !S.shopOpen) {
      enableHoverMode();
    }
  });
  document.addEventListener('pointerlockerror', function () {
    if (S.started && !S.shopOpen) enableHoverMode();
  });
}

// ====== 小地圖 ======
function drawMinimap() {
  var ctx = H.mmCtx, MM = H.mmCanvas.width;
  var RANGE = D.MAPS[S.mapIdx].arena + 5;
  ctx.clearRect(0,0,MM,MM);
  var g = ctx.createRadialGradient(MM/2,MM/2,0,MM/2,MM/2,MM/2);
  g.addColorStop(0,'rgba(12,22,32,0.7)');
  g.addColorStop(1,'rgba(6,12,20,0.85)');
  ctx.fillStyle = g; ctx.fillRect(0,0,MM,MM);
  var scale = (MM/2) / RANGE;
  var cx = MM/2, cy = MM/2;
  var cos = Math.cos(-S.yaw), sin = Math.sin(-S.yaw);
  function toMap(wx, wz) {
    var dx = wx - camera.position.x, dz = wz - camera.position.z;
    return { x: cx + (dx*cos - dz*sin)*scale, y: cy - (dx*sin + dz*cos)*scale };
  }
  ctx.strokeStyle = 'rgba(120,180,220,0.28)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx,cy,(MM/2)-3,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle = 'rgba(140,150,160,0.5)';
  for (var i=0; i<walls.length; i++) {
    var w = walls[i];
    if (Math.abs(w.position.x-camera.position.x) > RANGE+8) continue;
    if (Math.abs(w.position.z-camera.position.z) > RANGE+8) continue;
    var p = toMap(w.position.x, w.position.z);
    ctx.fillRect(p.x-w.scale.x*scale/2, p.y-w.scale.z*scale/2,
      Math.max(2,w.scale.x*scale), Math.max(2,w.scale.z*scale));
  }
  for (var pi=0; pi<pickups.length; pi++) {
    var pu = pickups[pi];
    if (pu.userData.taken) continue;
    var pp = toMap(pu.position.x, pu.position.z);
    ctx.fillStyle = pu.userData.slot === 1 ? '#6cf' : '#fc6';
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 4, 0, Math.PI*2); ctx.fill();
  }
  for (var j=0; j<enemies.length; j++) {
    var e = enemies[j];
    var ep = toMap(e.position.x, e.position.z);
    var isBoss = e.userData.isBoss;
    ctx.fillStyle = isBoss ? '#ff0066' : '#ff4433';
    ctx.beginPath(); ctx.arc(ep.x, ep.y, isBoss?8:5, 0, Math.PI*2); ctx.fill();
  }
  for (var rid in remotePlayers) {
    var rp = remotePlayers[rid];
    if (!rp.group) continue;
    var rpp = toMap(rp.group.position.x, rp.group.position.z);
    ctx.fillStyle = '#5faaff';
    ctx.beginPath(); ctx.arc(rpp.x, rpp.y, 6, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(95,208,255,0.10)';
  ctx.beginPath(); ctx.moveTo(cx,cy);
  ctx.arc(cx,cy,62,-Math.PI/2-0.58,-Math.PI/2+0.58);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5fd0ff';
  ctx.beginPath();
  ctx.moveTo(cx, cy-11); ctx.lineTo(cx-7, cy+8); ctx.lineTo(cx+7, cy+8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
}

// ====== 主迴圈 ======
var clock = new THREE.Clock();
var _forward = new THREE.Vector3();
var _right = new THREE.Vector3();
var _move = new THREE.Vector3();
var _toPlayer = new THREE.Vector3();
var _tmp = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);
  var now = performance.now()/1000;

  // Hover 模式轉視角
  if (S.useHover && !S.shopOpen && !S.locked && S.started) {
    var cx = innerWidth/2, cy = innerHeight/2;
    var nx = (S.mouseScreenX-cx)/cx, ny = (S.mouseScreenY-cy)/cy;
    nx = Math.max(-1, Math.min(1, nx));
    ny = Math.max(-1, Math.min(1, ny));
    var dz2 = 0.12;
    var rx = Math.sign(nx) * Math.max(0, Math.abs(nx)-dz2) / (1-dz2);
    var ry = Math.sign(ny) * Math.max(0, Math.abs(ny)-dz2) / (1-dz2);
    var maxRate = S.scoped ? 1.2 : 3.0;
    S.yaw -= rx * maxRate * dt;
    S.pitch -= ry * maxRate * dt;
    var lim = Math.PI/2 - 0.02;
    S.pitch = Math.max(-lim, Math.min(lim, S.pitch));
  }

  if (Math.abs(camera.fov - S.fovTarget) > 0.1) {
    camera.fov += (S.fovTarget - camera.fov) * Math.min(1, dt*12);
    camera.updateProjectionMatrix();
  }

  if (!S.started || S.shopOpen) { renderer.render(scene, camera); return; }

  if (S.reloading) {
    var prog = (now - S.reloadStart) / S.reloadDuration;
    if (prog >= 1) finishReload();
    else H.reloadBar.style.width = (prog*100) + '%';
  }
  if (S.isDead && now >= S.respawnAt) respawnPlayer();

  // 移動
  if (!S.isDead) {
    var sprinting = (S.keys['ShiftLeft'] || S.keys['ShiftRight']) &&
                    (S.keys['KeyW'] || S.keys['ArrowUp']);
    var speed = (sprinting ? 12 : 8) * S.mods.speedMul;
    if (S.scoped) speed *= 0.4;
    _forward.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    _right.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
    _move.set(0,0,0);
    if (S.keys['KeyW'] || S.keys['ArrowUp'])    _move.add(_forward);
    if (S.keys['KeyS'] || S.keys['ArrowDown'])  _move.sub(_forward);
    if (S.keys['KeyD'] || S.keys['ArrowRight']) _move.add(_right);
    if (S.keys['KeyA'] || S.keys['ArrowLeft'])  _move.sub(_right);
    if (_move.lengthSq() > 0) {
      _move.normalize().multiplyScalar(speed * dt);
      camera.position.x += _move.x;
      camera.position.z += _move.z;
      S.spreadAmount = Math.min(S.spreadAmount + dt*0.010, 0.028);
    }
    // 擊退
    camera.position.x += S.playerVel.x * dt;
    camera.position.z += S.playerVel.z * dt;
    S.playerVel.x *= Math.pow(0.001, dt);
    S.playerVel.z *= Math.pow(0.001, dt);
    var lim2 = D.MAPS[S.mapIdx].arena - 1;
    camera.position.x = Math.max(-lim2, Math.min(lim2, camera.position.x));
    camera.position.z = Math.max(-lim2, Math.min(lim2, camera.position.z));

    // 跳躍
    var maxJumps = (S.playerSlots[3]==='fist') ? (2 + S.mods.doubleJumpBonus) : 1;
    if (S.onGround) S.jumpsRemaining = maxJumps;
    if (S.keys['Space'] && S.jumpsRemaining > 0 && !S.spaceHeld) {
      S.velocityY = 6.3; S.onGround = false;
      S.jumpsRemaining--; S.spaceHeld = true;
    }
    if (!S.keys['Space']) S.spaceHeld = false;
    if (!S.onGround) {
      S.velocityY -= 18 * dt;
      S.eyeHeight += S.velocityY * dt;
      if (S.eyeHeight <= 1.7) {
        S.eyeHeight = 1.7; S.velocityY = 0; S.onGround = true;
      }
    }
  }

  S.recoilPitch *= Math.pow(0.0009, dt);
  S.spreadAmount *= Math.pow(0.0009, dt);
  S.spreadAmount = Math.max(S.spreadAmount, 0.002);
  S.shakeAmount *= Math.pow(0.0005, dt);
  var sx = (Math.random()-0.5)*S.shakeAmount;
  var sy = (Math.random()-0.5)*S.shakeAmount;
  camera.position.y = S.eyeHeight + sy;
  camera.rotation.y = S.yaw + sx;
  camera.rotation.x = S.pitch - S.recoilPitch;
  if (_move.lengthSq() > 0 && S.onGround) {
    camera.position.y += Math.sin(now*10)*0.038;
    camera.rotation.z = Math.sin(now*5)*0.008;
  } else {
    camera.rotation.z *= Math.pow(0.001, dt);
  }

  // 槍動畫
  var gz = -0.02 + (S.reloading?0.16:0);
  var gy = -0.22 - (S.reloading?0.12:0);
  if (S.scoped) { gz = 0.35; gy = -0.10; }
  gunGroup.position.z += (gz - gunGroup.position.z) * Math.min(1, dt*14);
  gunGroup.position.y += (gy - gunGroup.position.y) * Math.min(1, dt*10);
  gunGroup.rotation.x = S.reloading ? -0.42 : (S.scoped?-0.02:0);
  if (S.muzzleTimer > 0) {
    S.muzzleTimer -= dt;
    if (S.muzzleTimer <= 0) {
      if (muzzleSprite) muzzleSprite.material.opacity = 0;
      if (muzzleLight) muzzleLight.intensity = 0;
    }
  }
  if (S.mouseDown && !S.reloading && !S.isDead) {
    var key2 = S.playerSlots[S.currentSlot];
    var w2 = D.WEAPON_DATA[key2];
    if (w2.auto && w2.type === 'gun') shoot();
    if (w2.type === 'melee') meleeAttack();
  }

  updatePickups(dt, now);

  // 敵人 AI（本地）
  if (FS.shouldSimulateEnemies()) {
    for (var i2=enemies.length-1; i2>=0; i2--) {
      var e2 = enemies[i2];
      var ud = e2.userData;
      _toPlayer.subVectors(camera.position, e2.position);
      _toPlayer.y = 0;
      var dist = _toPlayer.length();
      if (dist > 0.001) _toPlayer.divideScalar(dist);
      var desired = ud.isBoss ? 22 : 15;
      if (dist > desired+3) e2.position.addScaledVector(_toPlayer, ud.speed*dt);
      else if (dist < desired-5) e2.position.addScaledVector(_toPlayer, -ud.speed*0.5*dt);
      else {
        _tmp.set(-_toPlayer.z, 0, _toPlayer.x);
        e2.position.addScaledVector(_tmp, Math.sin(now*1.4+ud.strafePhase)*ud.speed*0.5*dt);
      }
      var lim3 = D.MAPS[S.mapIdx].arena - 2;
      e2.position.x = Math.max(-lim3, Math.min(lim3, e2.position.x));
      e2.position.z = Math.max(-lim3, Math.min(lim3, e2.position.z));
      e2.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
      ud.shootTimer -= dt;
      if (ud.shootTimer <= 0 && dist < (ud.isBoss?70:45)) {
        ud.shootTimer = ud.fireInterval * (0.7 + Math.random()*0.7);
        enemyShoot(e2);
      }
      if (ud.isBoss) {
        ud.bossSummonTimer -= dt;
        if (ud.bossSummonTimer <= 0) {
          ud.bossSummonTimer = 8 + Math.random()*4;
          var cnt = 2 + Math.floor(S.wave/5);
          for (var sn=0; sn<cnt; sn++) {
            var ang = Math.random()*Math.PI*2, dd = 6 + Math.random()*4;
            spawnEnemy('fast', (S.wave-1)*14,
              e2.position.x + Math.cos(ang)*dd, e2.position.z + Math.sin(ang)*dd);
          }
          showBigMsg('BOSS 召喚援軍', '#ff8844', 30);
        }
      }
      if (ud.hitFlash > 0) {
        ud.hitFlash -= dt;
        ud.bodyMat.color.setHex(0xffffff);
        ud.armorMat.emissiveIntensity = 1.8;
      } else {
        var tt = 1 - (ud.hp/ud.maxHp);
        ud.bodyMat.color.setHex(D.ENEMY_TYPES[ud.type].body);
        ud.armorMat.color.setHex(D.ENEMY_TYPES[ud.type].armor);
        ud.armorMat.emissiveIntensity = 0.4 + tt*0.8;
      }
    }
  }

  // 敵人子彈
  for (var p2=projectiles.length-1; p2>=0; p2--) {
    var pr = projectiles[p2];
    pr.position.addScaledVector(pr.userData.vel, dt);
    pr.userData.life -= dt;
    var hitPlayer = !S.isDead && pr.position.distanceTo(
      _tmp.set(camera.position.x, camera.position.y-0.6, camera.position.z)) < 0.75;
    if (!hitPlayer && S.mode === 'pvpve') {
      for (var rid in remotePlayers) {
        var rp = remotePlayers[rid];
        if (rp.group && pr.position.distanceTo(
          rp.group.position.clone().setY(1.2)) < 0.9) { hitPlayer = true; break; }
      }
    }
    if (hitPlayer) {
      applyDamage(pr.userData.dmg || 8);
      scene.remove(pr); projectiles.splice(p2,1); continue;
    }
    if (pr.userData.life <= 0 || pr.position.y < 0.1) {
      scene.remove(pr); projectiles.splice(p2,1);
    }
  }

  // 手榴彈
  for (var gi=grenades.length-1; gi>=0; gi--) {
    var gr = grenades[gi];
    gr.userData.vel.y -= 18*dt;
    gr.position.addScaledVector(gr.userData.vel, dt);
    if (gr.position.y < 0.15) {
      gr.position.y = 0.15;
      gr.userData.vel.y *= -0.4;
      gr.userData.vel.x *= 0.75;
      gr.userData.vel.z *= 0.75;
    }
    for (var wI=0; wI<walls.length; wI++) {
      var wl2 = walls[wI];
      if (wl2.scale.x > 50) continue;
      var dx = gr.position.x - wl2.position.x;
      var dz = gr.position.z - wl2.position.z;
      var hw = wl2.scale.x/2 + 0.2, hd = wl2.scale.z/2 + 0.2;
      var hh = wl2.scale.y/2 + 0.2;
      if (Math.abs(dx)<hw && Math.abs(dz)<hd && gr.position.y < hh*2) {
        if (Math.abs(dx/hw) > Math.abs(dz/hd)) {
          gr.userData.vel.x *= -0.5;
          gr.position.x = wl2.position.x + Math.sign(dx)*(hw+0.05);
        } else {
          gr.userData.vel.z *= -0.5;
          gr.position.z = wl2.position.z + Math.sign(dz)*(hd+0.05);
        }
      }
    }
    gr.rotation.x += dt*8; gr.rotation.z += dt*12;
    gr.userData.fuse -= dt;
    if (gr.userData.fuse <= 0) {
      spawnExplosion(gr.position.clone(), 5);
      SFX.explode();
      var gw = D.WEAPON_DATA.grenade;
      if (FS.shouldSimulateEnemies()) {
        for (var ei2=enemies.length-1; ei2>=0; ei2--) {
          var en = enemies[ei2];
          var d2 = en.position.distanceTo(gr.position);
          if (d2 < gw.radius+2) {
            var dmg = gw.damage * (1-d2/(gw.radius+2)) * S.mods.damageMul;
            applyEnemyDamage(en.userData.netId, dmg);
          }
        }
      }
      for (var rid2 in remotePlayers) {
        var rp2 = remotePlayers[rid2];
        if (!rp2.group) continue;
        var d3 = rp2.group.position.distanceTo(gr.position);
        if (d3 < gw.radius+2) {
          var dmg2 = gw.damage * (1-d3/(gw.radius+2)) * S.mods.damageMul;
          if (FS.onHitRemote) FS.onHitRemote(dmg2);
        }
      }
      // 炸彈跳（自己無傷害）
      var sd = camera.position.distanceTo(gr.position);
      if (sd < gw.radius+3) {
        var pw = gw.knockbackPower * (1 - sd/(gw.radius+3));
        var aw = new THREE.Vector3().subVectors(camera.position, gr.position);
        aw.y = 0;
        if (aw.lengthSq() < 0.01) aw.set(Math.random()-0.5, 0, Math.random()-0.5);
        aw.normalize();
        S.playerVel.x += aw.x * pw;
        S.playerVel.z += aw.z * pw;
        if (gr.position.y < camera.position.y - 0.5) {
          S.velocityY = Math.max(S.velocityY, 8);
          S.onGround = false;
        }
        S.shakeAmount = Math.min(S.shakeAmount + 0.15, 0.25);
      }
      scene.remove(gr); grenades.splice(gi,1);
    }
  }

  // 爆炸視覺
  for (var ei3=explosions.length-1; ei3>=0; ei3--) {
    var ex = explosions[ei3];
    ex.life -= dt;
    var p3 = ex.life / ex.maxLife;
    if (ex.mesh) {
      ex.mesh.material.opacity = p3 * 0.9;
      ex.mesh.scale.setScalar(1 + (1-p3)*1.5);
    }
    if (ex.light) ex.light.intensity = p3 * 20;
    if (ex.life <= 0) {
      if (ex.mesh) { scene.remove(ex.mesh); ex.mesh.geometry.dispose(); ex.mesh.material.dispose(); }
      if (ex.light) scene.remove(ex.light);
      explosions.splice(ei3,1);
    }
  }

  // 粒子
  for (var q2=particles.length-1; q2>=0; q2--) {
    var pa = particles[q2];
    pa.userData.vel.y -= 17*dt;
    pa.position.addScaledVector(pa.userData.vel, dt);
    pa.userData.life -= dt;
    pa.material.opacity = Math.max(0, pa.userData.life*2.2);
    pa.rotation.x += pa.userData.spin*dt;
    pa.rotation.y += pa.userData.spin*0.7*dt;
    if (pa.userData.life <= 0 || pa.position.y < 0) {
      scene.remove(pa); pa.material.dispose(); particles.splice(q2,1);
    }
  }

  // 曳光
  for (var ti2=tracers.length-1; ti2>=0; ti2--) {
    var tr = tracers[ti2];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life/0.09)*0.85;
    if (tr.life <= 0) {
      scene.remove(tr.line); tr.line.geometry.dispose();
      tr.line.material.dispose(); tracers.splice(ti2,1);
    }
  }

  // 遠端玩家插值
  for (var rpid in remotePlayers) {
    var rp3 = remotePlayers[rpid];
    if (rp3.group && rp3.targetState) {
      var lerp = Math.min(1, dt*12);
      rp3.group.position.x += (rp3.targetState.x - rp3.group.position.x)*lerp;
      rp3.group.position.y += (rp3.targetState.y - rp3.group.position.y)*lerp;
      rp3.group.position.z += (rp3.targetState.z - rp3.group.position.z)*lerp;
      var dy = rp3.targetState.yaw - rp3.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI*2;
      while (dy < -Math.PI) dy += Math.PI*2;
      rp3.group.rotation.y += dy * lerp;
    }
    if (performance.now() - rp3.lastUpdate > 3000) {
      if (rp3.group) scene.remove(rp3.group);
      delete remotePlayers[rpid];
    }
  }

  // Boss 血條
  if (bossActive && bossActive.userData) {
    var bp = Math.max(0, bossActive.userData.hp / bossActive.userData.maxHp);
    H.bossFill.style.width = (bp*100) + '%';
  }

  // 模式更新
  if (FS.onUpdate) FS.onUpdate(dt, now);

  // 恢復
  if (S.hp < S.maxHp && !S.isDead) { S.hp = Math.min(S.maxHp, S.hp + 3.5*S.mods.regenMul*dt); updateBars(); }
  if (S.armor < S.maxArmor && S.hp >= S.maxHp*0.7 && !S.isDead) {
    S.armor = Math.min(S.maxArmor, S.armor + 1.8*dt); updateBars();
  }

  // 準星
  var gap = 3 + S.spreadAmount*1100;
  H.chT.style.left='23px'; H.chT.style.top=(24-gap-8)+'px';
  H.chB.style.left='23px'; H.chB.style.top=(24+gap)+'px';
  H.chL.style.left=(24-gap-8)+'px'; H.chL.style.top='23px';
  H.chR.style.left=(24+gap)+'px'; H.chR.style.top='23px';

  drawMinimap();
  updateScore();
  renderer.render(scene, camera);
}

// 敵人開火（供 AI 用）
var projGeo = new THREE.SphereGeometry(0.14, 7, 7);
function enemyShoot(e) {
  var ud = e.userData;
  if (!ud.isBoss) {
    var p = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({color:ud.bulletColor}));
    p.position.copy(e.position); p.position.y = 1.5*(e.scale.x||1);
    var dir = new THREE.Vector3().subVectors(camera.position, p.position).normalize();
    dir.x += (Math.random()-0.5)*0.045;
    dir.y += (Math.random()-0.5)*0.045;
    dir.z += (Math.random()-0.5)*0.045;
    dir.normalize();
    p.userData = { vel: dir.multiplyScalar(ud.bulletSpeed), life: 2.2, dmg: ud.damage };
    scene.add(p); projectiles.push(p);
    SFX.enemyGun();
    return;
  }
  var baseDir = new THREE.Vector3().subVectors(camera.position, e.position).normalize();
  for (var i=-2; i<=2; i++) {
    var ang = i*0.14;
    var c = Math.cos(ang), s = Math.sin(ang);
    var d2 = new THREE.Vector3(
      baseDir.x*c - baseDir.z*s, baseDir.y, baseDir.x*s + baseDir.z*c).normalize();
    var pb = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({color:ud.bulletColor}));
    pb.position.copy(e.position); pb.position.y = 4.5;
    pb.scale.setScalar(1.6);
    pb.userData = { vel: d2.multiplyScalar(ud.bulletSpeed), life: 3.0, dmg: ud.damage };
    scene.add(pb); projectiles.push(pb);
  }
  SFX.bossShot();
}

// ====== 網路（PeerJS 共用） ======
var peer = null, conn = null, isHost = false, roomId = '';
var netSyncTimer = 0, NET_INTERVAL = 0.05;

function setupPeer() {
  window.FS.createRoom = function () {
    if (peer) return;
    peer = new Peer({ debug:1, config:{ iceServers:[
      {urls:'stun:stun.l.google.com:19302'}, {urls:'stun:stun1.l.google.com:19302'}
    ]}});
    isHost = true;
    peer.on('open', function (id) {
      roomId = id;
      if (FS.onRoomCreated) FS.onRoomCreated(id);
    });
    peer.on('connection', function (c) {
      if (conn) { c.close(); return; }
      conn = c;
      setupConn(c);
    });
    peer.on('error', function (err) {
      if (FS.onNetError) FS.onNetError(err);
    });
  };
  window.FS.joinRoom = function (hostId) {
    if (peer) return;
    if (!hostId) return;
    isHost = false;
    peer = new Peer({ debug:1, config:{ iceServers:[
      {urls:'stun:stun.l.google.com:19302'}, {urls:'stun:stun1.l.google.com:19302'}
    ]}});
    peer.on('open', function () {
      var c = peer.connect(hostId, { reliable:true });
      conn = c;
      setupConn(c);
      setTimeout(function () {
        if (!S.started && FS.onNetTimeout) FS.onNetTimeout();
      }, 6000);
    });
    peer.on('error', function (err) {
      if (FS.onNetError) FS.onNetError(err);
    });
  };
}

function setupConn(c) {
  c.on('open', function () {
    if (FS.onConnected) FS.onConnected();
    FS.start();
  });
  c.on('data', function (data) { handleNet(data); });
  c.on('close', function () {
    if (S.started) {
      showBigMsg('對手已離線', '#f88', 34);
      setTimeout(function () { location.reload(); }, 2500);
    }
  });
}

function handleNet(data) {
  if (!data || typeof data !== 'object') return;
  if (data.t === 'state') {
    var rp = remotePlayers[data.id];
    if (!rp) {
      var color = 0x2a5a9a;
      var g = buildRemotePlayer(color);
      scene.add(g);
      remotePlayers[data.id] = { group:g, state:{}, lastUpdate:performance.now() };
      rp = remotePlayers[data.id];
    }
    rp.targetState = {
      x:data.x, y:data.y, z:data.z, yaw:data.yaw, pitch:data.pitch,
      hp:data.hp, weapon:data.weapon
    };
    rp.lastUpdate = performance.now();
  } else if (data.t === 'hitPlayer') {
    applyDamage(data.amount || 20);
  } else if (data.t === 'iDied') {
    S.enemyKills++;
    S.kills++;
    showBigMsg('擊殺！', '#5fd0ff', 44);
    SFX.kill();
    updateScore();
  } else if (data.t === 'shot') {
    SFX.enemyGun();
  } else if (data.t === 'enemyHit') {
    if (isHost && FS.onHostEnemyHit) FS.onHostEnemyHit(data.id, data.dmg);
  } else if (data.t === 'enemiesSync') {
    if (!isHost && FS.onEnemiesSync) FS.onEnemiesSync(data.enemies);
  }
}

function sendNet(data) {
  if (conn && conn.open) {
    try { conn.send(data); } catch (e) {}
  }
}
function sendStateSync(extra) {
  if (!conn || !conn.open || !S.started) return;
  var base = {
    t: 'state',
    id: peer ? peer.id : 'me',
    x: +camera.position.x.toFixed(2),
    y: +camera.position.y.toFixed(2),
    z: +camera.position.z.toFixed(2),
    yaw: +S.yaw.toFixed(2),
    pitch: +S.pitch.toFixed(2),
    hp: S.hp,
    weapon: S.playerSlots[S.currentSlot]
  };
  if (extra) for (var k in extra) base[k] = extra[k];
  sendNet(base);
}

// ====== 主 API ======
var FS = window.FS = {
  state: S,
  get enemies() { return enemies; },
  get pickups() { return pickups; },
  get remotePlayers() { return remotePlayers; },
  get peer() { return peer; },
  get conn() { return conn; },
  get isHost() { return isHost; },
  D: D,
  SFX: SFX,
  getMagSize: getMagSize,
  spawnEnemy: spawnEnemy,
  startWave: startWave,
  killEnemy: killEnemy,
  applyDamage: applyDamage,
  applyEnemyDamage: applyEnemyDamage,
  showBigMsg: showBigMsg,
  updateScore: updateScore,
  updateBars: updateBars,
  updateAmmoHud: updateAmmoHud,
  openShop: openShop,
  closeShop: closeShop,
  buildMap: buildMap,
  buildGun: buildGun,
  spawnParticles: spawnParticles,
  spawnExplosion: spawnExplosion,
  sendNet: sendNet,
  sendStateSync: sendStateSync,
  createRoom: null,  // setupPeer 填入
  joinRoom: null,
  H: H,

  // 模式鉤子（子 HTML 覆蓋）
  onUpdate: null,
  onStart: null,
  onShot: null,
  onHitRemote: null,
  onEnemyHit: null,
  onEnemyKilled: null,
  onPlayerDeath: null,
  onGrenadeThrown: null,
  onWaveClear: null,
  onRoomCreated: null,
  onNetError: null,
  onNetTimeout: null,
  onConnected: null,
  onHostEnemyHit: null,
  onEnemiesSync: null,
  shouldSimulateEnemies: function () {
    return S.mode === 'pve' || (S.mode === 'pvpve' && isHost);
  },

  init: function (options) {
    options = options || {};
    S.mode = options.mode || 'pve';
    S.mapIdx = options.map || 0;
    buildHUD();
    if (!initThree()) return false;
    setupInput();
    setupPeer();
    addEventListener('resize', function () {
      camera.aspect = innerWidth/innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    animate();
    return true;
  },

  start: function () {
    if (S.started) return;
    S.started = true;
    initAudio();
    buildMap(S.mapIdx);
    S.playerSlots = { 1:'rifle', 2:'pistol', 3:'fist', 4:'grenade' };
    S.slotState = {
      1: { ammo:getMagSize(D.WEAPON_DATA.rifle), reserve: 240 },
      2: { ammo:getMagSize(D.WEAPON_DATA.pistol), reserve: 96 },
      3: { cooldown: 0 },
      4: { count: S.mods.grenadeMax, cooldown: 0 }
    };
    S.currentSlot = 1;
    buildGun('rifle');
    renderWeaponSlots();
    updateAmmoHud();
    updateBars();
    updateScore();
    camera.position.set(0, 1.7, 0);
    S.yaw = 0; S.pitch = 0;
    S.hp = S.maxHp; S.armor = S.maxArmor;
    S.jumpsRemaining = (S.playerSlots[3]==='fist') ? (2 + S.mods.doubleJumpBonus) : 1;
    // 顯示 HUD
    H.crosshair.classList.remove('hidden');
    H.hitmarker.classList.remove('hidden');
    H.bars.classList.remove('hidden');
    H.ammo.classList.remove('hidden');
    H.stats.classList.remove('hidden');
    H.minimap.classList.remove('hidden');
    H.weaponSlots.classList.remove('hidden');
    H.modeHint.classList.remove('hidden');
    H.grenadeHud.classList.add('on');
    if (S.mode === 'pve') {
      H.waveRow.classList.remove('hidden');
      H.mpRow.classList.add('hidden');
    } else if (S.mode === 'pvp') {
      H.waveRow.classList.add('hidden');
      H.mpRow.classList.remove('hidden');
    } else {
      H.waveRow.classList.remove('hidden');
      H.mpRow.classList.remove('hidden');
    }
    if (canvas.requestPointerLock) canvas.requestPointerLock();
    enableHoverMode();
    if (FS.onStart) FS.onStart();
  },

  resetPlayerState: function () {
    S.hp = S.maxHp; S.armor = S.maxArmor;
    S.score = 0; S.kills = 0; S.enemyKills = 0;
    S.wave = 0; S.waveActive = false; S.waveCooldown = 1.2;
    D.UPGRADES.forEach(function (u) { u.level = 0; });
    S.mods = { damageMul:1, reloadMul:1, speedMul:1, regenMul:1,
               magMul:1, absorbMul:0.6, grenadeMax:3, doubleJumpBonus:0 };
  },

  // 波次邏輯（由 PVE / PVPVE 呼叫）
  runWaveLogic: function (dt) {
    if (S.waveActive && enemies.length === 0) {
      S.waveActive = false;
      var bonus = 300 + S.wave * 80;
      S.score += bonus;
      showBigMsg('清除 +' + bonus, '#5fd0ff', 36);
      updateScore();
      if (FS.onWaveClear) FS.onWaveClear();
    }
    if (!S.waveActive && S.waveCooldown > 0 && !S.shopOpen) {
      S.waveCooldown -= dt;
      if (S.waveCooldown <= 0) startWave();
    }
  }
};

})();
