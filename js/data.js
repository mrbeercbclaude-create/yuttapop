// Static game data: config, realms, techniques, meridian, enemies, maps, shop.
window.G = window.G || {};

G.CFG = {
  SUPABASE_URL: "https://wdealwhuejfdhhuiklbv.supabase.co",
  // Publishable anon key: safe in client code, row level security guards each save.
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZWFsd2h1ZWpmZGhodWlrbGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMDY3MzYsImV4cCI6MjEwODU4MjczNn0.bGdQQfWw91j_WrPmuUkq00XK_fqW4oNJKiD_ZL8syto",
  SAVE_KEY: "yuttapop-save-v1",
  W: 640, H: 360, GROUND: 300,
  OFFLINE_CAP: 12 * 3600,
  REACH: 46,
  HERO_H: 92
};

// req = what it takes to break INTO this realm. techTier: [min tier index, how many techniques].
G.REALMS = [
  { n: "ไร้ระดับ",           cap: 10, mult: 1.00, badge: "realm_1", req: null },
  { n: "ยอดฝีมือระดับสาม",   cap: 20, mult: 1.25, badge: "realm_2", req: { lv: 10, techTier: [1, 1], nodes: 0, pills: 0, base: 0.60 } },
  { n: "ยอดฝีมือระดับสอง",   cap: 30, mult: 1.56, badge: "realm_3", req: { lv: 20, techTier: [2, 1], nodes: 3, pills: 1, base: 0.50 } },
  { n: "ยอดฝีมือระดับหนึ่ง", cap: 40, mult: 1.95, badge: "realm_4", req: { lv: 30, techTier: [3, 2], nodes: 6, pills: 2, base: 0.40 } }
];

G.TIERS = [["เริ่มต้น", 0], ["คล่องมือ", 100], ["ชำนาญ", 400], ["เชี่ยวชาญ", 1200], ["ปรมาจารย์", 3000], ["สมบูรณ์แบบ", 8000]];

G.TECH = {
  cloud: { n: "กระบี่เมฆาสลาย",   kind: "basic",  icon: "tech_cloud_sword", mult: 1,   cd: 0,  desc: "ท่าพื้นฐาน ใช้ทุกการโจมตี" },
  star:  { n: "แทงทะลุดารา",      kind: "active", icon: "tech_star_thrust", mult: 2.2, cd: 6,  desc: "แทงเป้าเดียว แรง 2.2 เท่า", fx: "fx_slash_white", pose: "attack2" },
  palm:  { n: "ฝ่ามือมังกรคราม",  kind: "active", icon: "tech_dragon_palm", mult: 3,   cd: 10, aoe: 120, desc: "ซัดลมปราณโดนศัตรูทุกตัวในระยะ", fx: "fx_palm_blue", pose: "palm" },
  tiger: { n: "ดาบเสือดำผ่าภูผา", kind: "active", icon: "tech_tiger_blade", mult: 5,   cd: 15, desc: "ท่าที่แกนปราณวิเคราะห์จากบอส แรง 5 เท่า", fx: "fx_slash_blue", pose: "skill" },
  step:  { n: "ก้าวเงาวายุ",      kind: "move",   icon: "tech_wind_step",   desc: "เดินและโจมตีเร็วขึ้น" },
  heart: { n: "หัวใจธารใส",       kind: "inner",  icon: "tech_spring_heart", desc: "ฟื้นเลือดเร็วขึ้น ได้ปราณมากขึ้น" },
  bell:  { n: "ระฆังทองคุ้มกาย",  kind: "guard",  icon: "tech_golden_bell", cd: 25, desc: "เกราะปราณดูดซับดาเมจเมื่อเลือดต่ำ" }
};
G.KIND_NAME = { basic: "ท่าพื้นฐาน", active: "ท่าโจมตี", move: "ท่าเคลื่อนที่", inner: "วิชาภายใน", guard: "วิชาป้องกัน" };

// Heart meridian. Node 3 picks the path; node 6 follows it.
G.MERIDIAN = [
  { n: "จุดเส้าชง",   cost: 100,   eff: { atk: 0.08 },  txt: "ดาเมจ +8%" },
  { n: "จุดเส้าฝู่",  cost: 400,  eff: { crit: 0.03 }, txt: "คริ +3%" },
  { n: "จุดเสินเหมิน", cost: 1500, choice: true,
    righteous: { def: 0.15, brk: 0.10 }, rtxt: "ป้องกัน +15% · ทะลวงขั้น +10%",
    demonic: { atk: 0.20, critDmg: 0.25, regen: -0.3 }, dtxt: "ดาเมจ +20% · คริแรงขึ้น +25% · ฟื้นเลือด −30%" },
  { n: "จุดหลิงเต้า", cost: 5000, eff: { hp: 0.15 },   txt: "พลังชีวิต +15%" },
  { n: "จุดจี๋เฉวียน", cost: 15000, eff: { aspd: 0.08 }, txt: "ความเร็วโจมตี +8%" },
  { n: "แกนหัวใจ",    cost: 40000, choice: true,
    righteous: { atk: 0.25, hp: 0.25 }, rtxt: "ดาเมจ +25% · พลังชีวิต +25%",
    demonic: { atk: 0.40, critDmg: 0.40 }, dtxt: "ดาเมจ +40% · คริแรงขึ้น +40%" }
];

// Region 1. HP/EXP/def/dmg are this game's own numbers; shape follows the Idleon World 1 curve.
G.MON = {
  thug:  { n: "โจรกระจอก",          art: "enemy/r1/bandit_thug",  hp: 32,    exp: 3,    def: 1,  dmg: 0,  rs: 5,  spd: 20, h: 82,  shape: "human", col: "#8a7a62", band: "#c0392b" },
  wolf:  { n: "หมาป่าเทา",           art: "enemy/r1/wolf_gray",    hp: 120,   exp: 12,   def: 1,  dmg: 2,  rs: 6,  spd: 28, h: 52,  shape: "beast", col: "#8e939c", drop: ["wolf_pelt", 0.25] },
  knife: { n: "โจรมีดสั้น",          art: "enemy/r1/bandit_knife", hp: 450,   exp: 40,   def: 4,  dmg: 8,  rs: 6,  spd: 24, h: 84,  shape: "human", col: "#4f5552", band: "#2b2b2b", drop: ["iron_ore", 0.20] },
  boar:  { n: "หมูป่าเขี้ยวเหล็ก",    art: "enemy/r1/boar_iron",    hp: 900,   exp: 70,   def: 8,  dmg: 12, rs: 7,  spd: 22, h: 58,  shape: "boar",  col: "#7a5638", drop: ["boar_tusk", 0.25] },
  viper: { n: "งูพิษหยกเขียว",        art: "enemy/r1/viper_jade",   hp: 2600,  exp: 220,  def: 15, dmg: 30, rs: 7,  spd: 32, h: 40,  shape: "snake", col: "#58a36a", drop: ["spirit_grass", 0.20] },
  chief: { n: "หัวหน้าโจรภูเขา",      art: "enemy/r1/bandit_chief", hp: 7000,  exp: 500,  def: 25, dmg: 45, rs: 30, spd: 18, h: 110, shape: "human", col: "#5d4a3a", band: "#111", club: 1, drop: ["iron_ore", 1], manual: 0.06 },
  boss:  { n: "ดาบเสือดำ จอมโจร",     art: "enemy/r1/boss_r1_idle", artAtk: "enemy/r1/boss_r1_attack", hp: 45000, exp: 4500, def: 45, dmg: 95, rs: 90, spd: 14, h: 140, shape: "human", col: "#232323", band: "#8f1f24", club: 1, boss: true }
};

G.MAPS = [
  { id: "a", n: "ทุ่งชายป่าไผ่", mons: ["thug", "thug", "wolf", "thug", "wolf", "thug"],       req: null,                     tint: null },
  { id: "b", n: "ป่าไผ่ลึก",    mons: ["knife", "boar", "knife", "boar", "knife", "boar"],    req: { m: "wolf", k: 20 },     tint: "rgba(20,50,30,.18)" },
  { id: "c", n: "หุบงูหยก",     mons: ["viper", "viper", "chief", "viper", "viper"],          req: { m: "boar", k: 30 },     tint: "rgba(30,70,50,.25)" },
  { id: "d", n: "ค่ายเสือดำ",    mons: ["boss"],                                              req: { m: "chief", k: 10 },    tint: "rgba(80,20,15,.25)" }
];

G.MATS = {
  wolf_pelt:    { n: "หนังหมาป่า",       icon: "mat_wolf_pelt" },
  boar_tusk:    { n: "เขี้ยวหมูป่าเหล็ก", icon: "mat_boar_tusk" },
  iron_ore:     { n: "แร่เหล็ก",         icon: "mat_iron_ore" },
  spirit_grass: { n: "หญ้าวิญญาณ",       icon: "mat_spirit_grass" }
};

G.WEAPONS = [
  { n: "ดาบไม้ไผ่",    pow: 2,  cost: 0,    icon: "wpn_bamboo" },
  { n: "ดาบเหล็กกล้า", pow: 8,  cost: 300,  icon: "wpn_steel" },
  { n: "ดาบหยกเขียว",  pow: 22, cost: 4000, mats: { iron_ore: 15 }, icon: "wpn_jade" }
];
G.ARMORS = [
  { n: "ชุดผ้าป่าน",      def: 0,  cost: 0,    icon: "arm_hemp" },
  { n: "เสื้อหนังหมาป่า",  def: 6,  cost: 600,  mats: { wolf_pelt: 10 }, icon: "arm_hide" },
  { n: "เกราะเกล็ดเหล็ก",  def: 20, cost: 6000, mats: { boar_tusk: 25, iron_ore: 20 }, icon: "arm_scale" }
];
G.PILLS = {
  heal:  { n: "ยารักษาแผลใน", cost: 60,   icon: "pill_heal",  desc: "หายบาดเจ็บภายใน + เลือดเต็ม" },
  qi:    { n: "ยารวบรวมปราณ", cost: 250,  icon: "pill_qi",    desc: "ได้ปราณ 400" },
  brk:   { n: "ยาทะลวงขั้น",  cost: 1500, icon: "pill_break", mats: { spirit_grass: 10 }, desc: "จำเป็นตอนทะลวงขั้นสูง" }
};
G.MANUALS = [
  { t: "star", cost: 300 },
  { t: "bell", cost: 2500 }
];

G.MODES = {
  fight:    { n: "ต่อสู้" },
  meditate: { n: "ปิดด่าน" },
  study:    { n: "ศึกษา" }
};
