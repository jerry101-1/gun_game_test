window.FS_DATA = {
  WEAPON_DATA: {
    // 槽位 1
    rifle: { slot:1, name:'突擊步槍', type:'gun', auto:true, damage:22, fireRate:0.09,
      spread:0.011, recoil:0.0085, magSize:30, reserve:240, reloadTime:1.85,
      range:280, pellets:1, sound:'rifle', bodyColor:0x1a1a1e, barrelLen:0.52, magVisible:true },
    shotgun: { slot:1, name:'霰彈槍', type:'gun', auto:false, damage:14, fireRate:0.85,
      spread:0.09, recoil:0.05, magSize:6, reserve:36, reloadTime:2.4,
      range:50, pellets:9, sound:'shotgun', bodyColor:0x3a1a1a, barrelLen:0.58, magVisible:false },
    sniper: { slot:1, name:'狙擊槍', type:'gun', auto:false, damage:180, fireRate:1.2,
      spread:0.0006, recoil:0.06, magSize:5, reserve:25, reloadTime:2.8,
      range:500, pellets:1, sound:'sniper', bodyColor:0x1a2028, barrelLen:0.9, magVisible:false, scope:true },
    smg: { slot:1, name:'衝鋒槍', type:'gun', auto:true, damage:14, fireRate:0.055,
      spread:0.018, recoil:0.005, magSize:40, reserve:320, reloadTime:1.6,
      range:180, pellets:1, sound:'smg', bodyColor:0x2a2a2a, barrelLen:0.45, magVisible:true },
    // 槽位 2
    pistol: { slot:2, name:'重型手槍', type:'gun', auto:false, damage:58, fireRate:0.30,
      spread:0.004, recoil:0.024, magSize:12, reserve:96, reloadTime:1.25,
      range:280, pellets:1, sound:'pistol', bodyColor:0x28282e, barrelLen:0.42, magVisible:false },
    revolver: { slot:2, name:'左輪手槍', type:'gun', auto:false, damage:95, fireRate:0.55,
      spread:0.003, recoil:0.04, magSize:6, reserve:42, reloadTime:2.0,
      range:260, pellets:1, sound:'pistol', bodyColor:0x3a2a1a, barrelLen:0.48, magVisible:false },
    machinepistol: { slot:2, name:'衝鋒手槍', type:'gun', auto:true, damage:15, fireRate:0.07,
      spread:0.020, recoil:0.006, magSize:20, reserve:160, reloadTime:1.4,
      range:160, pellets:1, sound:'smg', bodyColor:0x1a1a28, barrelLen:0.38, magVisible:true },
    // 槽位 3
    fist: { slot:3, name:'拳頭', type:'melee', damage:55, fireRate:0.35, range:3.0,
      doubleJump:true, sound:'punch', bodyColor:0x8a6a4a },
    // 槽位 4
    grenade: { slot:4, name:'手榴彈', type:'grenade', damage:140, radius:6.5, fuse:2.0,
      cooldown:1.2, selfDamage:0, knockbackPower:22, sound:'throwG' }
  },

  MAPS: [
    { name:'競技場', difficulty:'★★☆', sky:0x6b8cae, fogColor:0x6b8cae, fogDensity:0.0055,
      ground:0x3f5a42, gridA:0x2a3f2a, gridB:0x335033, lightSun:0xffd9a8, lightAmb:0x8098b8,
      arena:30, matColors:[0x7a6a58,0x5a5a62,0x6a5040,0x4a5a58],
      walls:[[0,0,16,4,16,1],[0,0,8,4,8,0],[-3.5,-3.5,1.5,3,1.5,2],[3.5,3.5,1.5,3,1.5,2],
        [-12,8,4,3,4,0],[12,-8,4,3,4,0],[-8,-12,3,2,3,2],[8,12,3,2,3,2],[-18,-3,2,4,2,1],
        [18,3,2,4,2,1],[-5,15,3,2,3,3],[5,-15,3,2,3,3],[15,15,4,3,4,0],[-15,-15,4,3,4,0],
        [-22,22,3,3,3,2],[22,-22,3,3,3,2]] },
    { name:'城市廢墟', difficulty:'★★★', sky:0x8a8a78, fogColor:0x8a8a78, fogDensity:0.0085,
      ground:0x4a4a48, gridA:0x2a2a2a, gridB:0x3a3a3a, lightSun:0xfff0d0, lightAmb:0x8a8a90,
      arena:32, matColors:[0x4a4a48,0x5a5550,0x3a3a3a,0x6a5a4a],
      walls:[[-20,-20,14,8,14,0],[0,-20,12,10,14,1],[20,-20,14,6,14,0],[-20,0,14,12,10,1],
        [20,0,14,12,10,1],[-20,20,14,8,14,0],[0,20,12,6,14,1],[20,20,14,8,14,0],
        [0,0,10,3,10,2],[-6,0,2,5,8,3],[6,0,2,5,8,3],[0,-6,8,5,2,3],[0,6,8,5,2,3],
        [-10,-8,3,2,3,3],[10,8,3,2,3,3],[-10,8,3,2,3,3],[10,-8,3,2,3,3]] },
    { name:'工業核心', difficulty:'★★★', sky:0x3a4a5a, fogColor:0x4a5a6a, fogDensity:0.010,
      ground:0x2a3038, gridA:0x1a2028, gridB:0x2a3a4a, lightSun:0x88aacc, lightAmb:0x506878,
      arena:32, matColors:[0x4a5868,0x3a4552,0x5a6878,0x2a3a4a],
      walls:[[0,0,12,3,12,1],[0,0,8,6,8,2],[0,0,4,9,4,3],[-22,-22,12,5,12,1],[22,-22,12,5,12,1],
        [-22,22,12,5,12,1],[22,22,12,5,12,1],[-14,0,2,3,20,2],[14,0,2,3,20,2],[0,-14,20,3,2,2],
        [0,14,20,3,2,2],[-8,-8,3,4,3,0],[8,8,3,4,3,0],[-8,8,3,4,3,0],[8,-8,3,4,3,0],
        [-18,0,2,6,2,3],[18,0,2,6,2,3]] }
  ],

  ENEMY_TYPES: {
    grunt: { hp:100, speed:3.2, body:0x2a2622, armor:0x8b1a1a, visor:0xff2200, scale:1.0,
      fireInterval:1.5, damage:8, bulletSpeed:46, bulletColor:0xff7722, score:110, headMul:2.6 },
    fast: { hp:60, speed:5.5, body:0x2a1a0a, armor:0xd35400, visor:0xffaa00, scale:0.88,
      fireInterval:2.2, damage:5, bulletSpeed:55, bulletColor:0xffaa44, score:90, headMul:2.6 },
    heavy: { hp:280, speed:2.0, body:0x1a0a1a, armor:0x7d3c98, visor:0xcc00ff, scale:1.35,
      fireInterval:1.2, damage:14, bulletSpeed:40, bulletColor:0xbb66ff, score:220, headMul:2.0 },
    boss: { hp:2200, speed:1.7, body:0x1a2028, armor:0x2c3e50, visor:0xff0055, scale:2.8,
      fireInterval:2.2, damage:22, bulletSpeed:38, bulletColor:0xff3366, score:3000, headMul:1.6 }
  },

  UPGRADES: [
    { id:'hp', name:'強化裝甲', desc:'最大生命 +25', baseCost:450, max:8,
      apply:function(){ FS.state.maxHp+=25; FS.state.hp+=25; } },
    { id:'armor', name:'護甲鍍層', desc:'最大護甲 +25', baseCost:400, max:8,
      apply:function(){ FS.state.maxArmor+=25; FS.state.armor+=25; } },
    { id:'dmg', name:'火力增幅', desc:'傷害 +12%', baseCost:700, max:6,
      apply:function(){ FS.state.mods.damageMul+=0.12; } },
    { id:'reload', name:'快速換彈', desc:'換彈速度 +18%', baseCost:450, max:5,
      apply:function(){ FS.state.mods.reloadMul/=1.18; } },
    { id:'speed', name:'疾行靴', desc:'移動速度 +8%', baseCost:400, max:5,
      apply:function(){ FS.state.mods.speedMul+=0.08; } },
    { id:'regen', name:'再生系統', desc:'生命恢復 +90%', baseCost:500, max:5,
      apply:function(){ FS.state.mods.regenMul+=0.9; } },
    { id:'mag', name:'擴充彈匣', desc:'彈匣容量 +25%', baseCost:550, max:5,
      apply:function(){
        FS.state.mods.magMul+=0.25;
        for (var s=1; s<=4; s++) {
          var w = FS_DATA.WEAPON_DATA[FS.state.playerSlots[s]];
          if (w && w.type==='gun') FS.state.slotState[s].ammo = FS.getMagSize(w);
        }
      } },
    { id:'grenade', name:'手榴彈補給', desc:'手榴彈上限 +2', baseCost:350, max:5,
      apply:function(){ FS.state.mods.grenadeMax+=2; FS.state.slotState[4].count+=2; } },
    { id:'djump', name:'空中衝刺', desc:'二段跳 +1', baseCost:600, max:2,
      apply:function(){ FS.state.mods.doubleJumpBonus+=1; } }
  ]
};
