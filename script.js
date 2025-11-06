// Minimal fighting game prototype using Phaser 3
const WIDTH = 800, HEIGHT = 450;

const config = {
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  parent: 'game',
  backgroundColor: '#333',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1200 },
      debug: false
    }
  },
  scene: {
    preload,
    create,
    update
  }
};

const game = new Phaser.Game(config);

function preload() {
  // No external assets in this prototype
}

function create() {
  const scene = this;

  // ground
  const ground = scene.add.rectangle(WIDTH/2, HEIGHT - 20, WIDTH, 40, 0x444444);
  scene.physics.add.existing(ground, true);

  // arena bounds
  scene.physics.world.setBounds(0, 0, WIDTH, HEIGHT);

  // Create players
  scene.player1 = createFighter(scene, 200, HEIGHT - 80, 0x6a9cff, {
    left: 'A', right: 'D', jump: 'W', attack: 'S'
  });

  scene.player2 = createFighter(scene, 600, HEIGHT - 80, 0xff6a6a, {
    left: 'LEFT', right: 'RIGHT', jump: 'UP', attack: 'DOWN'
  });

  // Collide with ground
  scene.physics.add.collider(scene.player1.sprite, ground);
  scene.physics.add.collider(scene.player2.sprite, ground);

  // Overlap checks for attacks
  scene.physics.add.overlap(scene.player1.attackHitbox, scene.player2.sprite, () => {
    scene.player1.tryHit(scene.player2);
  });
  scene.physics.add.overlap(scene.player2.attackHitbox, scene.player1.sprite, () => {
    scene.player2.tryHit(scene.player1);
  });

  // UI: health bars
  scene.ui = scene.add.graphics();
  drawUI(scene);

  // Victory text
  scene.victoryText = scene.add.text(WIDTH/2, HEIGHT/2 - 20, '', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5).setDepth(10);
}

function update(time, delta) {
  const scene = this;
  if (!scene.player1 || !scene.player2) return;
  if (scene.victoryText.text) return; // stop when winner decided

  scene.player1.update();
  scene.player2.update();

  // Update hitboxes positions
  updateHitbox(scene.player1);
  updateHitbox(scene.player2);

  // Check death
  if (scene.player1.health <= 0) declareWinner(scene, 'Player 2 wins!');
  if (scene.player2.health <= 0) declareWinner(scene, 'Player 1 wins!');

  // Redraw UI
  drawUI(scene);
}

/* -------- Helper/Factory functions -------- */

function createFighter(scene, x, y, color, keyMap) {
  const sprite = scene.add.rectangle(x, y, 50, 90, color);
  scene.physics.add.existing(sprite);
  sprite.body.setCollideWorldBounds(true);
  sprite.body.setSize(40, 88);
  sprite.body.setOffset(5, 2);

  // Simple attack hitbox (invisible)
  const hitbox = scene.add.rectangle(x + 40, y, 40, 30, 0xffffff, 0.0);
  scene.physics.add.existing(hitbox);
  hitbox.body.allowGravity = false;
  hitbox.body.setEnable(false);

  const keys = scene.input.keyboard.addKeys({
    left: keyMap.left,
    right: keyMap.right,
    jump: keyMap.jump,
    attack: keyMap.attack
  });

  const fighter = {
    scene,
    sprite,
    attackHitbox: hitbox,
    keys,
    color,
    facing: 'right',
    isAttacking: false,
    attackTimer: 0,
    attackCooldown: 450, // ms
    health: 100,
    lastHitTime: 0,
    invulnMs: 300,
    update() {
      const b = this.sprite.body;
      const speed = 260;
      // Movement
      let vx = 0;
      if (this.keys.left.isDown) { vx = -speed; this.facing = 'left'; }
      else if (this.keys.right.isDown) { vx = speed; this.facing = 'right'; }
      b.setVelocityX(vx);

      // Jump
      if (this.keys.jump.isDown && b.onFloor()) {
        b.setVelocityY(-520);
      }

      // Simple friction
      if (vx === 0) b.setVelocityX(b.velocity.x * 0.9);

      // Attack input
      if (Phaser.Input.Keyboard.JustDown(this.keys.attack)) {
        this.startAttack();
      }

      // Attack timing
      if (this.isAttacking) {
        this.attackTimer -= scene.sys.game.loop.delta;
        if (this.attackTimer <= 0) {
          this.endAttack();
        }
      }

      // Face direction visually by small offset (no sprite flip needed for rectangle)
      // Update sprite depth so attacked opponent is visible above during knockback
      this.sprite.setDepth(1);
    },
    startAttack() {
      const now = this.scene.time.now;
      if (this.isAttacking) return;
      if (now - (this._lastAttackAt || 0) < this.attackCooldown) return;
      this._lastAttackAt = now;
      this.isAttacking = true;
      this.attackTimer = 150; // hit active frames
      // enable hitbox briefly after a short wind-up
      this.scene.time.delayedCall(60, () => {
        this.attackHitbox.body.setEnable(true);
        // small auto-disable for safety
        this.scene.time.delayedCall(120, () => {
          this.attackHitbox.body.setEnable(false);
        });
      });
      // visual punch (tween)
      const dx = this.facing === 'right' ? 12 : -12;
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + dx,
        duration: 80,
        yoyo: true
      });
    },
    endAttack() {
      this.isAttacking = false;
      this.attackHitbox.body.setEnable(false);
    },
    tryHit(opponent) {
      const now = this.scene.time.now;
      if (!this.isAttacking) return;
      if (now - opponent.lastHitTime < opponent.invulnMs) return; // invuln frames
      opponent.lastHitTime = now;
      // apply damage and knockback
      const dmg = 8 + Math.floor(Math.random() * 4);
      opponent.health = Math.max(0, opponent.health - dmg);
      const kb = this.facing === 'right' ? 260 : -260;
      opponent.sprite.body.setVelocityX(kb);
      opponent.sprite.body.setVelocityY(-150);
      // flash effect
      const origTint = opponent.color;
      opponent.sprite.fillColor = 0xffffff;
      scene.time.delayedCall(100, () => opponent.sprite.fillColor = origTint);
    }
  };

  return fighter;
}

function updateHitbox(fighter) {
  const sprite = fighter.sprite;
  const hb = fighter.attackHitbox;
  const offsetX = fighter.facing === 'right' ? 48 : -48;
  hb.x = sprite.x + offsetX;
  hb.y = sprite.y - 10;
  hb.body.reset(hb.x, hb.y);
  // keep disabled unless attacking; physics overlap checks still work when enabled
  hb.body.setEnable(fighter.isAttacking && hb.body.enable);
}

function drawUI(scene) {
  scene.ui.clear();
  // Player1 health (left)
  const p1 = scene.player1;
  const p2 = scene.player2;
  const barW = 280, barH = 18;
  // bg bars
  scene.ui.fillStyle(0x222222);
  scene.ui.fillRect(10, 10, barW, barH);
  scene.ui.fillRect(WIDTH - barW - 10, 10, barW, barH);
  // p1 health
  const p1Pct = Phaser.Math.Clamp(p1.health / 100, 0, 1);
  scene.ui.fillStyle(0x6a9cff);
  scene.ui.fillRect(10, 10, barW * p1Pct, barH);
  // p2 health
  const p2Pct = Phaser.Math.Clamp(p2.health / 100, 0, 1);
  scene.ui.fillStyle(0xff6a6a);
  scene.ui.fillRect(WIDTH - barW - 10 + (barW * (1 - p2Pct)), 10, barW * p2Pct, barH);
  // Labels
  scene.ui.fillStyle(0xffffff);
  scene.ui.fillRect(0,0,0,0); // no-op to ensure style is applied for subsequent text (Phaser lacks direct text in Graphics)
  // Show numeric health using scene text (create if absent)
  if (!scene.p1Text) {
    scene.p1Text = scene.add.text(16, 36, '', { fontSize: '12px', color: '#fff' });
    scene.p2Text = scene.add.text(WIDTH - 140, 36, '', { fontSize: '12px', color: '#fff' });
  }
  scene.p1Text.setText('Player 1: ' + p1.health);
  scene.p2Text.setText('Player 2: ' + p2.health);
}

function declareWinner(scene, text) {
  scene.victoryText.setText(text + '\nPress F5 to restart');
}
