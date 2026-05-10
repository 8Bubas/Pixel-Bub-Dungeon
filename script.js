const config = {
    type: Phaser.AUTO,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 450 },
    physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
    scene: [LobbyScene, GameScene]
};
const game = new Phaser.Game(config);

// --- СЦЕНА 1: ЛОББИ ---
function LobbyScene() { Phaser.Scene.call(this, { key: 'LobbyScene' }); }
LobbyScene.prototype = Object.create(Phaser.Scene.prototype);
LobbyScene.prototype.create = function() {
    const { width: w, height: h } = this.scale;
    const classes = [
        { id: 'WARRIOR', color: 0xc0392b, label: 'ВОИН\n(2 удара = труп)' },
        { id: 'MAGE', color: 0x8e44ad, label: 'МАГ\n(Сплеш + Поджог)' },
        { id: 'ARCHER', color: 0x27ae60, label: 'ЛУЧНИК\n(Криты)' }
    ];
    this.add.text(w/2, 40, "ВЫБЕРИ ГЕРОЯ", { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
    classes.forEach((c, i) => {
        let x = (w / 3) * i;
        let btn = this.add.rectangle(x + w/6, h/2 + 20, w/3 - 30, h - 100, c.color, 0.8).setInteractive();
        this.add.text(x + w/6, h/2 + 20, c.label, { fontSize: '20px', fill: '#fff', align: 'center' }).setOrigin(0.5);
        btn.on('pointerdown', () => this.scene.start('GameScene', { pClass: c.id, floor: 1, hp: 100 }));
    });
};

// --- СЦЕНА 2: ИГРА ---
function GameScene() { Phaser.Scene.call(this, { key: 'GameScene' }); }
GameScene.prototype = Object.create(Phaser.Scene.prototype);

GameScene.prototype.init = function(data) {
    this.pClassData = data.pClass;
    this.currentFloor = data.floor || 1;
    this.playerHp = data.hp || 100;
    this.lastFired = 0;
    this.moveStick = { active: false, base: null, thumb: null, pointer: null, angle: 0, force: 0 };
    this.shootStick = { active: false, base: null, thumb: null, pointer: null, angle: 0, force: 0 };
    this.mageCharges = 5;
    this.archerArrows = 30;
};

GameScene.prototype.create = function() {
    const { width: w, height: h } = this.scale;
    this.input.addPointer(2);

    // 1. ТЕКСТУРЫ
    let g = this.make.graphics({x:0, y:0, add:false});
    g.fillStyle(0x3e4042); g.fillRect(0, 0, 40, 40); g.lineStyle(2, 0x2b2c2e); g.strokeRect(0, 0, 40, 40); 
    g.fillStyle(0x000000); g.fillRect(40, 0, 40, 40); 
    g.fillStyle(0x2980b9); g.fillRect(80, 0, 40, 40); 
    g.generateTexture('dungeonTiles', 120, 40);

    let pColor = this.pClassData === 'WARRIOR' ? 0xc0392b : (this.pClassData === 'MAGE' ? 0x8e44ad : 0x27ae60);
    createRectTexture(this, 'pTex', 24, 24, pColor);
    createCircleTexture(this, 'goblin', 12, 0x1d8348);
    createCircleTexture(this, 'boss', 40, 0x008080); 
    createCircleTexture(this, 'guard', 12, 0x87ceeb); 
    createCircleTexture(this, 'jBase', 50, 0xffffff, 0.2);
    createCircleTexture(this, 'jThumb', 25, 0xffffff, 0.5);
    createRectTexture(this, 'swing', 60, 80, 0xffffff, 0.2);
    createRectTexture(this, 'exit', 40, 40, 0xf1c40f, 0.8);
    createRectTexture(this, 'chest', 20, 20, 0xd35400); 
    createRectTexture(this, 'bullet_arrow', 18, 4, 0xf1c40f); 
    createRectTexture(this, 'bullet_magic', 12, 12, 0x3498db);

    // 2. КАРТА
    let mapSize = 50; 
    let mapData = (this.currentFloor === 5) ? generateBossLevel(mapSize, mapSize) : generateDungeon(mapSize, mapSize);
    const map = this.make.tilemap({ data: mapData.grid, tileWidth: 40, tileHeight: 40 });
    const tileset = map.addTilesetImage('dungeonTiles', 'dungeonTiles', 40, 40, 0, 0);
    this.layer = map.createLayer(0, tileset, 0, 0).setDepth(-10);
    this.layer.setCollision(1); 
    this.physics.world.setBounds(0, 0, mapSize*40, mapSize*40);

    // 3. ГРУППЫ И ИГРОК
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.guards = this.physics.add.group();
    this.chests = this.physics.add.group();

    let startRoom = mapData.rooms[0];
    this.player = this.physics.add.sprite(startRoom.cx * 40, startRoom.cy * 40, 'pTex').setCollideWorldBounds(true);
    
    // СПАВН УРОВНЯ
    if (this.currentFloor < 5) {
        // Увеличили количество гоблинов
        let gobCount = Phaser.Math.Between(12 + (this.currentFloor-1)*3, 16 + (this.currentFloor-1)*5);
        
        for(let i=1; i < mapData.rooms.length; i++) { 
            let rm = mapData.rooms[i];
            if (this.pClassData === 'ARCHER' && Math.random() > 0.6) this.chests.create(rm.cx*40, rm.cy*40, 'chest');
        }
        
        for(let i=0; i < gobCount; i++) {
            let rIdx = Phaser.Math.Between(1, mapData.rooms.length - 1);
            let rm = mapData.rooms[rIdx];
            let gX = (rm.rx + 1) * 40 + Math.random()*(rm.rw-2)*40;
            let gY = (rm.ry + 1) * 40 + Math.random()*(rm.rh-2)*40;
            
            // ЖЕСТКАЯ ПРОВЕРКА ДИСТАНЦИИ СПАВНА
            if (Phaser.Math.Distance.Between(gX, gY, this.player.x, this.player.y) < 350) {
                i--; // Если слишком близко к игроку - отменяем и пробуем заново
                continue;
            }

            let gob = this.enemies.create(gX, gY, 'goblin');
            gob.hp = 100; gob.isAgro = false;
        }
        
        // РАНДОМНЫЙ ПОРТАЛ (выбираем случайную комнату из второй половины лабиринта)
        let exitIndex = Phaser.Math.Between(Math.floor(mapData.rooms.length / 2), mapData.rooms.length - 1);
        let exitRoom = mapData.rooms[exitIndex];
        this.exitPortal = this.physics.add.sprite(exitRoom.cx*40, exitRoom.cy*40, 'exit');

    } else {
        // СПАВН БОССА
        this.boss = this.physics.add.sprite(25 * 40, 25 * 40, 'boss'); 
        this.boss.hp = 500;
        this.boss.isBoss = true;
        for(let i=0; i<5; i++){
            let guard = this.guards.create(this.boss.x + Phaser.Math.Between(-120,120), this.boss.y + Phaser.Math.Between(-120,120), 'guard');
            guard.hp = 100;
        }
        this.laserGraphics = this.add.graphics().setDepth(50);
        this.bossAttackTimer = 0;
    }

    // 4. КАМЕРА И UI
    this.cameras.main.setBounds(0, 0, mapSize*40, mapSize*40);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.uiText = this.add.text(20, 20, `ЭТАЖ: ${this.currentFloor}/5  HP: ${this.playerHp}`, { fontSize: '20px', fill: '#fff' }).setScrollFactor(0);
    this.createJoysticks();
    
    if(this.pClassData === 'MAGE') {
        this.chargeIcons = [];
        for(let i=0; i<5; i++) {
            let icon = this.add.rectangle(400 + (i*15) - 30, 20, 10, 10, 0x3498db).setScrollFactor(0);
            this.chargeIcons.push(icon);
        }
        this.time.addEvent({ delay: 1500, loop: true, callback: () => {
            if(this.mageCharges < 5) {
                this.mageCharges++;
                this.chargeIcons.forEach((icon, idx) => icon.setAlpha(idx < this.mageCharges ? 1 : 0.2));
            }
        }});
    } else if (this.pClassData === 'ARCHER') {
        this.uiAmmoText = this.add.text(400, 20, `Стрелы: ${this.archerArrows}`, { fontSize: '18px', fill: '#f1c40f' }).setScrollFactor(0).setOrigin(0.5, 0);
    }

    // 5. ФИЗИКА
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.enemies, this.layer); 
    this.physics.add.collider(this.guards, this.layer);
    this.physics.add.collider(this.bullets, this.layer, (b) => b.destroy());
    
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => handleBulletHit(this, b, e));
    this.physics.add.overlap(this.bullets, this.guards, (b, g) => handleBulletHit(this, b, g));
    this.physics.add.overlap(this.bullets, this.boss, (b, bos) => {
        if(this.guards.countActive() === 0) handleBulletHit(this, b, bos);
        else { b.destroy(); showFloatingText(this, bos.x, bos.y, "УБЕЙ СТРАЖЕЙ!", 0x3498db); }
    });

    this.physics.add.overlap(this.player, this.enemies, () => this.takeDamage(100));
    this.physics.add.overlap(this.player, this.chests, (p, chest) => {
        chest.destroy();
        this.archerArrows += Phaser.Math.Between(5, 10);
        if(this.uiAmmoText) this.uiAmmoText.setText(`Стрелы: ${this.archerArrows}`);
        showFloatingText(this, p.x, p.y - 20, "+Стрелы", 0xf1c40f);
    });

    if(this.exitPortal) this.physics.add.overlap(this.player, this.exitPortal, () => this.nextFloor());
};
GameScene.prototype.update = function(time) {
    let tile = this.layer.getTileAtWorldXY(this.player.x, this.player.y);
    let speed = 220;
    if(tile && tile.index === 2) speed *= 0.5;

    let isMoving = false;
    if (this.moveStick.active) {
        updateStickData(this.moveStick);
        this.player.setVelocity(Math.cos(this.moveStick.angle) * speed * this.moveStick.force, Math.sin(this.moveStick.angle) * speed * this.moveStick.force);
        if(this.moveStick.force > 0.1) isMoving = true;
    } else { this.player.setVelocity(0); }

    this.player.isMoving = isMoving;

    if (this.shootStick.active) {
        updateStickData(this.shootStick);
        this.player.rotation = this.shootStick.angle;
        if (this.shootStick.force > 0.9 && time > this.lastFired) handleAttack(this, time);
    }

    this.enemies.children.each(g => {
        if(g.active) {
            let d = Phaser.Math.Distance.Between(this.player.x, this.player.y, g.x, g.y);
            if(d < 250) g.isAgro = true;
            if(g.isAgro) this.physics.moveToObject(g, this.player, 90);
            else g.setVelocity(0);
        }
    });

    if(this.currentFloor === 5 && this.boss && this.boss.active) {
        if(this.guards.countActive() > 0 && time % 100 < 20) this.boss.hp = Math.min(500, this.boss.hp + 0.1 * this.guards.countActive());
        
        this.bossAttackTimer += 1;
        if(this.bossAttackTimer > 600) {
            this.laserGraphics.clear();
            this.laserGraphics.lineStyle(3, 0xff0000, 0.6);
            this.laserGraphics.lineBetween(this.boss.x, this.boss.y, this.player.x, this.player.y);
            
            if(this.bossAttackTimer > 840) { 
                this.takeDamage(50);
                this.bossAttackTimer = 0;
                this.laserGraphics.clear();
                this.boss.x = Phaser.Math.Between(16,34)*40;
                this.boss.y = Phaser.Math.Between(16,34)*40;
            }
        }
    }
};

GameScene.prototype.takeDamage = function(amt) {
    this.playerHp -= amt;
    this.uiText.setText(`ЭТАЖ: ${this.currentFloor}/5  HP: ${this.playerHp}`);
    if(this.playerHp <= 0) this.scene.start('LobbyScene');
};

GameScene.prototype.nextFloor = function() {
    this.scene.restart({ pClass: this.pClassData, floor: this.currentFloor + 1, hp: this.playerHp });
};

// --- БОЕВКА ---
function handleAttack(scene, time) {
    if (scene.pClassData === 'WARRIOR') {
        let s = scene.add.sprite(scene.player.x + Math.cos(scene.player.rotation)*30, scene.player.y + Math.sin(scene.player.rotation)*30, 'swing');
        s.rotation = scene.player.rotation;
        scene.physics.add.existing(s);
        
        let hitList = [];
        scene.physics.add.overlap(s, scene.enemies, (sw, e) => { if(!hitList.includes(e)) { hitList.push(e); dealDamage(scene, e, 50, 0xffffff); } });
        scene.physics.add.overlap(s, scene.guards, (sw, g) => { if(!hitList.includes(g)) { hitList.push(g); dealDamage(scene, g, 50, 0xffffff); } });
        if(scene.boss && scene.guards.countActive() === 0) {
            scene.physics.add.overlap(s, scene.boss, (sw, b) => { if(!hitList.includes(b)) { hitList.push(b); dealDamage(scene, b, 50, 0xffffff); } });
        }
        scene.time.delayedCall(100, () => s.destroy());
        scene.lastFired = time + 400;
    } 
    else if (scene.pClassData === 'MAGE') {
        if(scene.mageCharges > 0) {
            scene.mageCharges--;
            scene.chargeIcons.forEach((icon, idx) => icon.setAlpha(idx < scene.mageCharges ? 1 : 0.2));
            let b = scene.bullets.create(scene.player.x, scene.player.y, 'bullet_magic');
            scene.physics.velocityFromRotation(scene.player.rotation, 400, b.body.velocity);
            b.isMage = true; 
            scene.lastFired = time + 500;
        }
    } 
    else if (scene.pClassData === 'ARCHER') {
        if(scene.archerArrows > 0) {
            scene.archerArrows--;
            scene.uiAmmoText.setText(`Стрелы: ${scene.archerArrows}`);
            let b = scene.bullets.create(scene.player.x, scene.player.y, 'bullet_arrow');
            b.rotation = scene.player.rotation; 
            let mult = scene.player.isMoving ? 1 : 2; 
            b.damage = 50 * mult;
            scene.physics.velocityFromRotation(scene.player.rotation, 500 * mult, b.body.velocity);
            scene.lastFired = time + 350;
        }
    }
}

function handleBulletHit(scene, bullet, enemy) {
    let dmg = bullet.damage || 15;
    bullet.destroy();
    
    if(bullet.isMage) {
        // СПЛЕШ УРЕЗАН ДО 30 ПИКСЕЛЕЙ
        let explosion = scene.add.circle(bullet.x, bullet.y, 30, 0x8e44ad, 0.3);
        scene.time.delayedCall(100, () => explosion.destroy()); 
        
        let nearby = scene.physics.overlapCirc(bullet.x, bullet.y, 30);
        nearby.forEach(body => {
            let t = body.gameObject;
            if(t && t.active && (t.texture.key === 'goblin' || t.texture.key === 'guard' || t.isBoss)) {
                dealDamage(scene, t, 15, 0x8e44ad);
                applyBurn(scene, t);
            }
        });
    } else {
        dealDamage(scene, enemy, dmg, dmg > 50 ? 0xff0000 : 0xffffff); 
    }
}

function applyBurn(scene, target) {
    scene.time.addEvent({
        delay: 1000,
        repeat: 4,
        callback: () => { if(target && target.active) dealDamage(scene, target, 4, 0xe67e22); }
    });
}

function dealDamage(scene, target, amt, color) {
    target.hp -= amt;
    showFloatingText(scene, target.x, target.y, `-${Math.floor(amt)}`, color);
    target.setTint(0xff0000);
    scene.time.delayedCall(100, () => { if(target.active) target.clearTint(); });

    if(target.hp <= 0) {
        if(target.isBoss) { alert("ПОБЕДА! РЫБА ПОВЕРЖЕНА!"); scene.scene.start('LobbyScene'); }
        target.destroy();
    }
}

function showFloatingText(scene, x, y, txt, col) {
    let t = scene.add.text(x + Phaser.Math.Between(-10,10), y, txt, {fontSize:'16px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5);
    t.setTint(col);
    scene.tweens.add({targets:t, y:y-40, alpha:0, duration:800, onComplete:()=>t.destroy()});
}

// --- ГЕНЕРАЦИЯ ---
function generateDungeon(w, h) {
    let grid = Array(h).fill().map(() => Array(w).fill(1));
    let rooms = [];
    let roomCount = 15; 
    
    for(let i=0; i<roomCount; i++) {
        let rw = Phaser.Math.Between(4, 12); 
        let rh = Phaser.Math.Between(4, 12);
        let rx = Phaser.Math.Between(2, w-rw-2);
        let ry = Phaser.Math.Between(2, h-rh-2);
        
        for(let y=ry; y<ry+rh; y++) for(let x=rx; x<rx+rw; x++) grid[y][x] = 0;
        let cx = Math.floor(rx+rw/2), cy = Math.floor(ry+rh/2);
        
        if(rooms.length > 0){
            let p = rooms[Phaser.Math.Between(0, rooms.length-1)];
            let thick = Phaser.Math.Between(1, 3); 
            
            for(let x=Math.min(cx,p.cx); x<=Math.max(cx,p.cx); x++) {
                for(let t=0; t<thick; t++) if(p.cy+t < h) grid[p.cy+t][x]=0;
            }
            for(let y=Math.min(cy,p.cy); y<=Math.max(cy,p.cy); y++) {
                for(let t=0; t<thick; t++) if(cx+t < w) grid[y][cx+t]=0;
            }
        }
        rooms.push({cx, cy, rx, ry, rw, rh});
    }
    return {grid, rooms};
}

function generateBossLevel(w, h) {
    let grid = Array(h).fill().map(() => Array(w).fill(1));
    for(let y=2; y<8; y++) for(let x=22; x<28; x++) grid[y][x] = 0;
    for(let y=8; y<15; y++) for(let x=24; x<26; x++) grid[y][x] = 0;
    for(let y=15; y<35; y++) for(let x=10; x<40; x++) grid[y][x] = 2; 
    for(let y=23; y<27; y++) for(let x=23; x<27; x++) grid[y][x] = 0;
    for(let y=15; y<24; y++) for(let x=24; x<26; x++) grid[y][x] = 0;
    
    return { grid, rooms: [{cx:25, cy:5}] }; 
}

// --- УПРАВЛЕНИЕ ---
GameScene.prototype.createJoysticks = function() {
    this.moveStick.base = this.add.image(0,0,'jBase').setVisible(false).setDepth(200).setScrollFactor(0);
    this.moveStick.thumb = this.add.image(0,0,'jThumb').setVisible(false).setDepth(201).setScrollFactor(0);
    this.shootStick.base = this.add.image(0,0,'jBase').setVisible(false).setDepth(200).setScrollFactor(0);
    this.shootStick.thumb = this.add.image(0,0,'jThumb').setVisible(false).setDepth(201).setScrollFactor(0);
    this.input.on('pointerdown', p => { if(p.x < 400) activateStick(this.moveStick, p); else activateStick(this.shootStick, p); });
    this.input.on('pointerup', p => { if(this.moveStick.pointer===p) deactivateStick(this.moveStick); if(this.shootStick.pointer===p) deactivateStick(this.shootStick); });
};
function activateStick(s,p){ s.active=true; s.pointer=p; s.base.setPosition(p.x, p.y).setVisible(true); s.thumb.setPosition(p.x, p.y).setVisible(true); }
function deactivateStick(s){ s.active=false; s.base.setVisible(false); s.thumb.setVisible(false); }
function updateStickData(s){
    let p = s.pointer; s.angle = Phaser.Math.Angle.Between(s.base.x, s.base.y, p.x, p.y);
    let d = Phaser.Math.Distance.Between(s.base.x, s.base.y, p.x, p.y); s.force = Math.min(d, 50)/50;
    s.thumb.x = s.base.x + Math.cos(s.angle)*s.force*50; s.thumb.y = s.base.y + Math.sin(s.angle)*s.force*50;
}
function createRectTexture(s,k,w,h,c,a=1){let g=s.make.graphics({x:0,y:0,add:false}); g.fillStyle(c,a); g.fillRect(0,0,w,h); g.generateTexture(k,w,h);}
function createCircleTexture(s,k,r,c,a=1){let g=s.make.graphics({x:0,y:0,add:false}); g.fillStyle(c,a); g.fillCircle(r,r,r); g.generateTexture(k,r*2,r*2);}