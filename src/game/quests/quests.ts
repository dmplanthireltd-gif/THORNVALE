import type { EnemyKind } from '../world/WorldMap';
import type { ItemStack } from '../inventory/items';

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  /** Any of these monsters count. */
  targets: EnemyKind[];
  /** Words used in progress messages. */
  targetName: string;
  count: number;
  requires: string | null;
  minLevel?: number;
  offer: string;
  progress: string;
  complete: string;
  rewardExp: number;
  rewardItems: ItemStack[];
}

export const QUESTS: QuestDef[] = [
  {
    id: 'vermin', title: 'Vermin in the Fields', giver: 'aldric', targets: ['rat'], targetName: 'rats', count: 6, requires: null,
    offer: 'Rats have overrun Miller\'s farm east of the plaza and the sewers under the village. Slay six of them and I\'ll see you paid.',
    progress: 'The rats still swarm the farm. Come back when you have slain six.',
    complete: 'Six fewer mouths on the grain! Here\'s your pay, and a couple of potions for the road.',
    rewardExp: 120, rewardItems: [{ id: 'gold', qty: 40 }, { id: 'health_potion', qty: 2 }, { id: 'backpack', qty: 1 }],
  },
  {
    id: 'greywood', title: 'Howls in the Greywood', giver: 'aldric', targets: ['wolf'], targetName: 'wolves', count: 6, requires: 'vermin', minLevel: 3,
    offer: 'Wolves prowl the Greywood north of the village and the Bramblewood beyond. Thin the pack by six and the woodcutters can work again.',
    progress: 'The wolves still howl at night. Six of them.',
    complete: 'Quiet nights at last. Take this rope - the old holes in this land are deep.',
    rewardExp: 250, rewardItems: [{ id: 'gold', qty: 60 }, { id: 'rope', qty: 1 }, { id: 'health_potion', qty: 3 }],
  },
  {
    id: 'restless', title: 'The Restless Dead', giver: 'aldric', targets: ['skeleton'], targetName: 'skeletons', count: 4, requires: 'greywood',
    offer: 'The dead in the old graveyard south-west of the plaza are walking. Put four skeletons back in the ground and my old kite shield is yours.',
    progress: 'The graveyard is still restless. Four skeletons.',
    complete: 'The dead lie quiet again. Take my shield - it served me well at the Pass of Greywood.',
    rewardExp: 450, rewardItems: [{ id: 'gold', qty: 120 }, { id: 'iron_shield', qty: 1 }, { id: 'shovel', qty: 1 }],
  },
  {
    id: 'bandits', title: 'The Bandit Hollow', giver: 'aldric', targets: ['bandit'], targetName: 'bandits', count: 8, requires: 'restless', minLevel: 8,
    offer: 'Bandits have dug in at a hollow south-west of the village and rob every cart on the Westmarch road. Eight of them, and the road is safe.',
    progress: 'The bandits still hold the hollow. Eight of them.',
    complete: 'The carts roll again. Westmarch sends its thanks - and this helmet from their armoury.',
    rewardExp: 900, rewardItems: [{ id: 'gold', qty: 200 }, { id: 'iron_helmet', qty: 1 }],
  },
  {
    id: 'grimtusk', title: 'Tusks of Grimtusk', giver: 'aldric', targets: ['orc', 'orc_spearman', 'orc_warrior', 'orc_berserker', 'orc_shaman', 'orc_leader'], targetName: 'orcs', count: 15, requires: 'bandits', minLevel: 10,
    offer: 'Orcs hold a fortress just north of here - Grimtusk Fortress. Their raiders grow bolder each week. Cut down fifteen of them and I will give you Frostbrand, the blade my father carried.',
    progress: 'Grimtusk still stands strong. Fifteen orcs.',
    complete: 'Fifteen orcs! They will think twice before raiding us. Frostbrand is yours - keep its edge clean.',
    rewardExp: 2500, rewardItems: [{ id: 'gold', qty: 400 }, { id: 'frostbrand', qty: 1 }],
  },
  {
    id: 'warlord', title: 'Head of the Horde', giver: 'aldric', targets: ['orc_warlord'], targetName: 'orc warlords', count: 1, requires: 'grimtusk', minLevel: 25,
    offer: 'Their warlord hides in the chambers beneath the Grimtusk keep. Go down there and end him.',
    progress: 'The warlord still lives beneath the keep.',
    complete: 'The horde is broken. Thornvale owes you more than gold - but gold is what I have.',
    rewardExp: 6000, rewardItems: [{ id: 'gold', qty: 1500 }, { id: 'ring_of_might', qty: 1 }],
  },
  {
    id: 'wings', title: 'Wings of Ruin', giver: 'aldric', targets: ['dragon'], targetName: 'dragons', count: 3, requires: 'warlord', minLevel: 35,
    offer: 'Smoke rises from the Dragonspire Plateau east of the village. Dragons nest there, and something older dwells in the Caldera at its heart. Slay three dragons.',
    progress: 'Three dragons. Bring potions, and stay out of the fire.',
    complete: 'You have done what no one in Thornvale dared. Take this mail of dragon scale, Dragonslayer.',
    rewardExp: 12000, rewardItems: [{ id: 'gold', qty: 3000 }, { id: 'dragon_scale_mail', qty: 1 }],
  },
  {
    id: 'abyss', title: 'Into the Abyss', giver: 'aldric', targets: ['demon'], targetName: 'demons', count: 1, requires: 'wings', minLevel: 80,
    offer: 'Far to the south, beside the town of Saltmere, lie the Ruins of Varkh. Stairs lead down into the earth - four floors down, they say, demons walk. Prove it. Slay one.',
    progress: 'The abyss is still open. One demon.',
    complete: 'By the light... you came back. Take the King\'s Edge. No one deserves it more.',
    rewardExp: 50000, rewardItems: [{ id: 'gold', qty: 20000 }, { id: 'kings_edge', qty: 1 }],
  },
  {
    id: 'mistwood', title: 'Webs of the Mistwood', giver: 'westmarch_marshal', targets: ['tarantula'], targetName: 'tarantulas', count: 8, requires: null, minLevel: 15,
    offer: 'Giant spiders breed in the Mistwood west of our walls and drag off travellers. Burn out eight of them.',
    progress: 'The Mistwood still crawls. Eight tarantulas.',
    complete: 'The western road is clear. The city pays its debts.',
    rewardExp: 3000, rewardItems: [{ id: 'gold', qty: 500 }, { id: 'strong_health_potion', qty: 4 }],
  },
  {
    id: 'wm_catacombs', title: 'The Chapel Below', giver: 'westmarch_marshal', targets: ['skeleton', 'ghoul'], targetName: 'undead', count: 10, requires: 'mistwood', minLevel: 15,
    offer: 'Beneath the ruined chapel south of the walls the old catacombs have woken. Ten of the dead, and we will seal the stairs again.',
    progress: 'Ten of the restless dead, below the chapel.',
    complete: 'The chapel is quiet. Take this armour - it was blessed there, once.',
    rewardExp: 4000, rewardItems: [{ id: 'gold', qty: 600 }, { id: 'chain_armor', qty: 1 }],
  },
  {
    id: 'sunscar', title: 'The Sunscar Warband', giver: 'westmarch_marshal', targets: ['amazon', 'valkyrie'], targetName: 'amazons and valkyries', count: 10, requires: 'wm_catacombs', minLevel: 25,
    offer: 'A warband of amazons holds the sandy clearing in the heart of the continent. Their raids reach our farms. Break them - ten warriors.',
    progress: 'The Sunscar warband still rides. Ten of them.',
    complete: 'The warband scatters. Take this bow, taken from their chieftain.',
    rewardExp: 9000, rewardItems: [{ id: 'gold', qty: 1200 }, { id: 'composite_bow', qty: 1 }],
  },
  {
    id: 'renegades', title: 'Renegades in the Mines', giver: 'stonedeep_thane', targets: ['dwarf', 'dwarf_soldier'], targetName: 'renegade dwarves', count: 10, requires: null, minLevel: 10,
    offer: 'Renegade diggers have claimed the upper mines and turned their picks on us. Ten of them, and the ore flows again.',
    progress: 'Ten renegades. The mine entrance is outside our south-east wall.',
    complete: 'The mines are ours again. A dwarven helmet - wear it with pride.',
    rewardExp: 3000, rewardItems: [{ id: 'gold', qty: 400 }, { id: 'dwarven_helmet', qty: 1 }],
  },
  {
    id: 'deep_guard', title: 'The Deep Delvings', giver: 'stonedeep_thane', targets: ['dwarf_guard'], targetName: 'dwarf guards', count: 5, requires: 'renegades', minLevel: 20,
    offer: 'The renegade guards hold the Deep Delvings, one floor further down. Five of them.',
    progress: 'Five guards in the Deep Delvings.',
    complete: 'Well fought. This shield was forged in Stonedeep itself.',
    rewardExp: 7000, rewardItems: [{ id: 'gold', qty: 800 }, { id: 'dwarven_shield', qty: 1 }],
  },
  {
    id: 'molten', title: 'Fire in the Deep', giver: 'stonedeep_thane', targets: ['behemoth'], targetName: 'behemoths', count: 1, requires: 'deep_guard', minLevel: 60,
    offer: 'Below the Delvings lies the Molten Deep, and something huge walks there. Slay a behemoth and the clan will sing of you.',
    progress: 'One behemoth, in the Molten Deep.',
    complete: 'They will sing of this for a hundred years. Take the clan\'s armour.',
    rewardExp: 25000, rewardItems: [{ id: 'gold', qty: 4000 }, { id: 'dwarven_armor', qty: 1 }],
  },
  {
    id: 'downs', title: 'Bears on the Downs', giver: 'highmoor_reeve', targets: ['bear', 'wolf'], targetName: 'bears and wolves', count: 8, requires: null, minLevel: 5,
    offer: 'Bears and wolves come down from the downs south of town and take our sheep. Eight of them, please.',
    progress: 'Eight beasts from the downs.',
    complete: 'The flocks are safe. Not much, but honestly earned.',
    rewardExp: 700, rewardItems: [{ id: 'gold', qty: 150 }, { id: 'health_potion', qty: 5 }],
  },
  {
    id: 'orc_ridge', title: 'Orc Ridge', giver: 'highmoor_reeve', targets: ['orc', 'orc_warrior', 'orc_berserker', 'orc_shaman'], targetName: 'orcs', count: 12, requires: 'downs', minLevel: 20,
    offer: 'Orcs from the ridge south-east of the downs raid our caravans. Twelve of them.',
    progress: 'Twelve orcs from Orc Ridge.',
    complete: 'The ridge is quiet. Here, Highmoor steel.',
    rewardExp: 5000, rewardItems: [{ id: 'gold', qty: 700 }, { id: 'battle_axe', qty: 1 }],
  },
  {
    id: 'mb_fields', title: 'Trouble in the Fields', giver: 'millbrook_elder', targets: ['rat'], targetName: 'rats', count: 8, requires: null,
    offer: 'Rats in the wheat north of the village! Eight of them, and you will eat with us tonight.',
    progress: 'Eight rats in the fields.',
    complete: 'Thank you, dear. Take some bread money and a sturdy pack.',
    rewardExp: 150, rewardItems: [{ id: 'gold', qty: 50 }, { id: 'backpack', qty: 1 }],
  },
  {
    id: 'mb_spiders', title: 'The Spider Glade', giver: 'millbrook_elder', targets: ['tarantula'], targetName: 'tarantulas', count: 6, requires: 'mb_fields', minLevel: 15,
    offer: 'Spiders nest in the glade west of the village. Six of them.',
    progress: 'Six tarantulas in the Spider Glade.',
    complete: 'Brave soul. Potions from Mother Hesk, with her compliments.',
    rewardExp: 2500, rewardItems: [{ id: 'gold', qty: 300 }, { id: 'strong_health_potion', qty: 3 }, { id: 'strong_mana_potion', qty: 3 }],
  },
  {
    id: 'mb_crypt', title: 'The Hollow Crypt', giver: 'millbrook_elder', targets: ['ghoul', 'skeleton'], targetName: 'undead', count: 6, requires: 'mb_spiders', minLevel: 15,
    offer: 'The old crypt east of the village has opened. Six of the dead, before they reach our homes.',
    progress: 'Six undead in the Hollow Crypt.',
    complete: 'Bless you. My late husband\'s helmet - he would want it used.',
    rewardExp: 3500, rewardItems: [{ id: 'gold', qty: 400 }, { id: 'chain_helmet', qty: 1 }],
  },
  {
    id: 'pelts', title: 'Pelts for the Winter', giver: 'valdrheim_jarl', targets: ['winter_wolf', 'polar_bear'], targetName: 'winter wolves and polar bears', count: 6, requires: null, minLevel: 8,
    offer: 'Winter comes early in the north. Bring down six winter wolves or polar bears - their furs will warm the longhouse.',
    progress: 'Six winter beasts.',
    complete: 'Good furs! Take this armour of fur, stitched by our own hands.',
    rewardExp: 1500, rewardItems: [{ id: 'gold', qty: 200 }, { id: 'fur_armor', qty: 1 }],
  },
  {
    id: 'skullfell', title: 'The Skullfell Raiders', giver: 'valdrheim_jarl', targets: ['barbarian_raider', 'barbarian_skullhunter', 'barbarian_brutetamer', 'barbarian_headsplitter'], targetName: 'barbarians', count: 10, requires: 'pelts', minLevel: 20,
    offer: 'Outcast barbarians camp at Skullfell in the south-west of our isle and raid our boats. Ten of them.',
    progress: 'Ten barbarians from Skullfell.',
    complete: 'The raids will stop. Take this frost helm.',
    rewardExp: 6000, rewardItems: [{ id: 'gold', qty: 800 }, { id: 'frost_helm', qty: 1 }],
  },
  {
    id: 'floes', title: 'The Frostkin Floes', giver: 'valdrheim_jarl', targets: ['frostkin', 'frostkin_toolshaper', 'frostkin_windcaller'], targetName: 'frostkin', count: 10, requires: 'skullfell', minLevel: 25,
    offer: 'The frostkin on the floes south of the mountains steal our fishing nets. Ten of them - cross the ice bridges with care.',
    progress: 'Ten frostkin from the floes.',
    complete: 'The nets are safe. These boots walk the ice without slipping.',
    rewardExp: 8000, rewardItems: [{ id: 'gold', qty: 900 }, { id: 'glacier_boots', qty: 1 }],
  },
  {
    id: 'hexspire', title: 'The Witch of Hexspire', giver: 'valdrheim_jarl', targets: ['ice_witch'], targetName: 'ice witches', count: 2, requires: 'floes', minLevel: 30,
    offer: 'A tower of ice stands near Frostholm, and witches brew storms at its top. Two of them.',
    progress: 'Two ice witches, in the Hexspire.',
    complete: 'The skies clear. Take this robe from their tower.',
    rewardExp: 10000, rewardItems: [{ id: 'gold', qty: 1200 }, { id: 'glacier_robe', qty: 1 }],
  },
  {
    id: 'jotun', title: 'Giants of Jotun Isle', giver: 'valdrheim_jarl', targets: ['frost_giant', 'frost_giantess'], targetName: 'frost giants', count: 6, requires: 'hexspire', minLevel: 40,
    offer: 'Giants walk on Jotun Isle to the east - the boatman Halvar will take you. Six of them.',
    progress: 'Six giants of Jotun Isle.',
    complete: 'Ha! The skalds will sing of this. Take the frost legs.',
    rewardExp: 18000, rewardItems: [{ id: 'gold', qty: 2500 }, { id: 'frost_legs', qty: 1 }],
  },
  {
    id: 'frostfang', title: 'Frostfang', giver: 'valdrheim_jarl', targets: ['frost_dragon'], targetName: 'frost dragons', count: 3, requires: 'jotun', minLevel: 60,
    offer: 'Under the Frostfang Glacier the frost dragons sleep. Three of them, and you are a jarl in all but name.',
    progress: 'Three frost dragons, under the glacier.',
    complete: 'Jarl in all but name! The frost plate is yours.',
    rewardExp: 40000, rewardItems: [{ id: 'gold', qty: 6000 }, { id: 'frost_plate', qty: 1 }],
  },
  {
    id: 'aur_sewers', title: 'Beneath the Crown', giver: 'aurelion_magistrate', targets: ['rat', 'ghoul', 'skeleton', 'tarantula'], targetName: 'sewer vermin', count: 10, requires: null, minLevel: 8,
    offer: 'The sewers beneath the south-west district crawl with filth. Ten of the things down there.',
    progress: 'Ten creatures in the sewers.',
    complete: 'The city breathes easier. The treasury pays.',
    rewardExp: 1200, rewardItems: [{ id: 'gold', qty: 300 }, { id: 'strong_health_potion', qty: 2 }],
  },
  {
    id: 'aur_catacombs', title: 'The Catacombs of Aurelion', giver: 'aurelion_magistrate', targets: ['skeleton', 'ghoul'], targetName: 'undead', count: 12, requires: 'aur_sewers', minLevel: 20,
    offer: 'Below the sewers lie the old catacombs. The dead there must rest again - twelve of them.',
    progress: 'Twelve undead in the catacombs.',
    complete: 'Order restored beneath the crown. Take this helmet from the guard\'s armoury.',
    rewardExp: 5000, rewardItems: [{ id: 'gold', qty: 800 }, { id: 'winged_helmet', qty: 1 }],
  },
  {
    id: 'ashfall', title: 'The Ashfall Fields', giver: 'aurelion_magistrate', targets: ['fire_elemental'], targetName: 'fire elementals', count: 4, requires: 'aur_catacombs', minLevel: 30,
    offer: 'West of the walls the ash fields burn with living fire. Put out four of the elementals.',
    progress: 'Four fire elementals in the Ashfall Fields.',
    complete: 'The west wind is clean again. A ring of sunstone for you.',
    rewardExp: 9000, rewardItems: [{ id: 'gold', qty: 1200 }, { id: 'sunstone_ring', qty: 1 }],
  },
  {
    id: 'emberhold', title: 'The Lord of Emberhold', giver: 'aurelion_magistrate', targets: ['dragon_lord'], targetName: 'dragon lords', count: 1, requires: 'ashfall', minLevel: 70,
    offer: 'Across the strait to the east stands Emberhold, a fortress in a moat of lava. A dragon lord rules from its throne. End it.',
    progress: 'The dragon lord still sits on the Ember Throne.',
    complete: 'The crown is in your debt. Take this amulet from the royal vault.',
    rewardExp: 35000, rewardItems: [{ id: 'gold', qty: 8000 }, { id: 'amulet_of_warding', qty: 1 }],
  },
  {
    id: 'briar', title: 'Wolves of the Briar Hills', giver: 'briarwatch_ranger', targets: ['wolf', 'bear', 'bandit'], targetName: 'beasts and bandits', count: 8, requires: null, minLevel: 8,
    offer: 'The hills around Briarwatch are not safe for our traders. Eight wolves, bears or bandits.',
    progress: 'Eight from the Briar Hills.',
    complete: 'Good hunting. These boots will carry you far.',
    rewardExp: 1200, rewardItems: [{ id: 'gold', qty: 250 }, { id: 'traveler_boots', qty: 1 }],
  },
  {
    id: 'minotaurs', title: 'The Minotaur Hold', giver: 'briarwatch_ranger', targets: ['minotaur', 'minotaur_archer', 'minotaur_mage'], targetName: 'minotaurs', count: 12, requires: 'briar', minLevel: 25,
    offer: 'Minotaurs hold a stone fort in the rocky lands west of here. Twelve of them.',
    progress: 'Twelve minotaurs.',
    complete: 'The fort falls silent. Take this morning star.',
    rewardExp: 9000, rewardItems: [{ id: 'gold', qty: 1200 }, { id: 'morning_star', qty: 1 }],
  },
  {
    id: 'scalemire', title: 'Scales in the Swamp', giver: 'briarwatch_ranger', targets: ['lizard_sentinel', 'lizard_templar'], targetName: 'lizardfolk', count: 10, requires: 'minotaurs', minLevel: 25,
    offer: 'Lizardfolk gather at a sunken temple in the Scalemire swamp south of town. Ten of them.',
    progress: 'Ten lizardfolk from the Scalemire.',
    complete: 'Their rites are broken. This scaled armour came from their sanctum.',
    rewardExp: 11000, rewardItems: [{ id: 'gold', qty: 1500 }, { id: 'lizardscale_armor', qty: 1 }],
  },
  {
    id: 'amazons', title: 'Raiders of the Wilds', giver: 'corvane_reeve', targets: ['amazon'], targetName: 'amazons', count: 8, requires: null, minLevel: 20,
    offer: 'Amazons in the wilds north of town ambush our woodcutters. Eight of them.',
    progress: 'Eight amazons.',
    complete: 'The woodcutters thank you. Take this spear.',
    rewardExp: 4000, rewardItems: [{ id: 'gold', qty: 600 }, { id: 'royal_spear', qty: 1 }],
  },
  {
    id: 'valkyries', title: 'Shieldmaidens', giver: 'corvane_reeve', targets: ['valkyrie'], targetName: 'valkyries', count: 5, requires: 'amazons', minLevel: 25,
    offer: 'Their valkyries are the real danger. Five of them.',
    progress: 'Five valkyries.',
    complete: 'Corvane sleeps soundly. Our finest shield is yours.',
    rewardExp: 7000, rewardItems: [{ id: 'gold', qty: 1000 }, { id: 'tower_shield', qty: 1 }],
  },
  {
    id: 'varkh', title: 'The Ruins of Varkh', giver: 'saltmere_abbot', targets: ['skeleton', 'ghoul'], targetName: 'undead', count: 8, requires: null, minLevel: 10,
    offer: 'The ruins east of our town leak the dead into our fields. Eight of them.',
    progress: 'Eight undead from the ruins.',
    complete: 'The fields are hallowed again. Take these potions, blessed at our altar.',
    rewardExp: 2500, rewardItems: [{ id: 'gold', qty: 300 }, { id: 'great_health_potion', qty: 3 }],
  },
  {
    id: 'varkh_crypt', title: 'The Crypt of Varkh', giver: 'saltmere_abbot', targets: ['ghoul'], targetName: 'ghouls', count: 6, requires: 'varkh', minLevel: 25,
    offer: 'Beneath the ruins lies the crypt. Six ghouls, and pray as you go.',
    progress: 'Six ghouls in the crypt.',
    complete: 'You walked in the dark and came back. Take this amulet.',
    rewardExp: 8000, rewardItems: [{ id: 'gold', qty: 1000 }, { id: 'scarab_amulet', qty: 1 }],
  },
  {
    id: 'varkh_fire', title: 'The Burning Catacombs', giver: 'saltmere_abbot', targets: ['fire_elemental'], targetName: 'fire elementals', count: 5, requires: 'varkh_crypt', minLevel: 45,
    offer: 'Two floors down the catacombs burn. Five fire elementals.',
    progress: 'Five elementals in the Burning Catacombs.',
    complete: 'Remarkable. Captain Aldric of Thornvale should hear of you.',
    rewardExp: 16000, rewardItems: [{ id: 'gold', qty: 2500 }, { id: 'wand_of_embers', qty: 1 }],
  },
  {
    id: 'silverbough', title: 'Trouble in Silverbough', giver: 'brann', targets: ['elf', 'elf_scout', 'elf_arcanist'], targetName: 'elves', count: 12, requires: null, minLevel: 12,
    offer: 'The elves of Silverbough Fortress, just west of Elderglen, shoot anyone who walks the woods. Thin their ranks - twelve of them - and the road stays open.',
    progress: 'Twelve elves, and mind the archers on the platforms.',
    complete: 'The road is quiet again. Here - elven make, taken from one of their scouts.',
    rewardExp: 3500, rewardItems: [{ id: 'gold', qty: 800 }, { id: 'composite_bow', qty: 1 }, { id: 'traveler_boots', qty: 1 }],
  },
  {
    id: 'warden', title: 'The Grove Warden', giver: 'brann', targets: ['elf_warden'], targetName: 'elf wardens', count: 1, requires: 'silverbough', minLevel: 30,
    offer: 'Their warden commands from the high platform in the heart of the fortress. Bring him down.',
    progress: 'The warden still watches from the canopy.',
    complete: 'Without their warden the elves will scatter. Take this circlet, and my thanks.',
    rewardExp: 8000, rewardItems: [{ id: 'gold', qty: 1500 }, { id: 'elven_circlet', qty: 1 }],
  },
  {
    id: 'crocs', title: 'Snapping Jaws', giver: 'tomas', targets: ['crocodile'], targetName: 'crocodiles', count: 8, requires: null, minLevel: 20,
    offer: 'The river crocodiles take a fisherman every month. Eight of them, and I will tell you where the hydras nest.',
    progress: 'The river is still full of teeth. Eight crocodiles.',
    complete: 'Good. Listen: hydras nest in the bog east of the delta, and in the Mire Caves beneath it.',
    rewardExp: 3000, rewardItems: [{ id: 'gold', qty: 600 }, { id: 'strong_health_potion', qty: 5 }],
  },
  {
    id: 'lizards', title: 'The Lizard Temple', giver: 'tomas', targets: ['lizard_sentinel', 'lizard_templar'], targetName: 'lizardfolk', count: 8, requires: 'crocs', minLevel: 30,
    offer: 'In the north of the jungle stands a temple of the lizardfolk. Eight of them, before they come down the river.',
    progress: 'Eight lizardfolk from the temple.',
    complete: 'Ha, still sharp. Take this jade - it was theirs.',
    rewardExp: 9000, rewardItems: [{ id: 'gold', qty: 1200 }, { id: 'jade_amulet', qty: 1 }],
  },
  {
    id: 'hydras', title: 'Seven Heads, One Hunter', giver: 'tomas', targets: ['hydra'], targetName: 'hydras', count: 5, requires: 'lizards', minLevel: 45,
    offer: 'The hydras killed my brother. Five of them, from the Hydra Bog or the caves beneath. Then I can rest.',
    progress: 'Five hydras. Fire hurts them more than you would think.',
    complete: 'Five... thank you, hunter. Take the legs I had made from the first one I ever killed.',
    rewardExp: 20000, rewardItems: [{ id: 'gold', qty: 5000 }, { id: 'hydra_legs', qty: 1 }, { id: 'frost_pendant', qty: 1 }],
  },
  {
    id: 'stingers', title: 'Stingers in the Sand', giver: 'sunspire_vizier', targets: ['scorpion'], targetName: 'scorpions', count: 10, requires: null, minLevel: 12,
    offer: 'Scorpions infest the dunes north of the city. Ten of them, for the caravans\' sake.',
    progress: 'Ten scorpions.',
    complete: 'The caravans give thanks. Gold of Sunspire for you.',
    rewardExp: 2000, rewardItems: [{ id: 'gold', qty: 400 }, { id: 'strong_mana_potion', qty: 4 }],
  },
  {
    id: 'tombs', title: 'The Valley of Tombs', giver: 'sunspire_vizier', targets: ['mummy', 'scarab'], targetName: 'mummies and scarabs', count: 10, requires: 'stingers', minLevel: 30,
    offer: 'The tombs north of the city stir. Ten mummies or scarabs, and seal what you can.',
    progress: 'Ten from the tombs.',
    complete: 'The valley sleeps. Take this shield of the scarab guard.',
    rewardExp: 8000, rewardItems: [{ id: 'gold', qty: 1200 }, { id: 'scarab_shield', qty: 1 }],
  },
  {
    id: 'kesh', title: 'The Pyramid of Kesh', giver: 'sunspire_vizier', targets: ['mummy'], targetName: 'mummies', count: 15, requires: 'tombs', minLevel: 45,
    offer: 'Deep below the Pyramid of Kesh lies a vault of the old kings. Fifteen mummies guard the way.',
    progress: 'Fifteen mummies, in the tomb of Kesh.',
    complete: 'You have walked where kings were buried. The city honours you.',
    rewardExp: 20000, rewardItems: [{ id: 'gold', qty: 4000 }, { id: 'small_diamond', qty: 3 }],
  },
  {
    id: 'raiders', title: 'Dune Raiders', giver: 'dunewatch_sergeant', targets: ['bandit'], targetName: 'raiders', count: 8, requires: null, minLevel: 12,
    offer: 'Raiders camp in the dunes south of the outpost. Eight of them.',
    progress: 'Eight raiders.',
    complete: 'The road to Sunspire is open. Here, a crossbow from their stash.',
    rewardExp: 2000, rewardItems: [{ id: 'gold', qty: 300 }, { id: 'light_crossbow', qty: 1 }],
  },
  {
    id: 'crags', title: 'The Scorched Crags', giver: 'dunewatch_sergeant', targets: ['cyclops'], targetName: 'cyclopes', count: 4, requires: 'raiders', minLevel: 30,
    offer: 'Cyclopes roam the crags between the desert and the jungle. Four of them.',
    progress: 'Four cyclopes.',
    complete: 'Fine work. Take this hammer.',
    rewardExp: 6000, rewardItems: [{ id: 'gold', qty: 800 }, { id: 'war_hammer', qty: 1 }],
  },
  {
    id: 'behemoths', title: 'The Behemoth Halls', giver: 'dunewatch_sergeant', targets: ['behemoth'], targetName: 'behemoths', count: 3, requires: 'crags', minLevel: 70,
    offer: 'Below the crags lie halls where behemoths sleep. Three of them, if you dare.',
    progress: 'Three behemoths.',
    complete: 'Three! The watch salutes you. Plate armour from the outpost\'s best.',
    rewardExp: 30000, rewardItems: [{ id: 'gold', qty: 6000 }, { id: 'plate_armor', qty: 1 }],
  },
];

export interface QuestProgress {
  status: QuestStatus;
  kills: number;
}

export class QuestLog {
  state: Record<string, QuestProgress> = {};

  constructor() {
    this.reset();
  }

  reset(): void {
    this.state = {};
    for (const q of QUESTS) this.state[q.id] = { status: q.requires ? 'locked' : 'available', kills: 0 };
  }

  get(id: string): QuestProgress {
    return this.state[id];
  }

  onKill(kind: EnemyKind): QuestDef[] {
    const changed: QuestDef[] = [];
    for (const q of QUESTS) {
      const s = this.state[q.id];
      if (s.status === 'active' && q.targets.includes(kind)) {
        s.kills = Math.min(q.count, s.kills + 1);
        if (s.kills >= q.count) s.status = 'ready';
        changed.push(q);
      }
    }
    return changed;
  }

  accept(id: string): boolean {
    const s = this.state[id];
    if (!s || s.status !== 'available') return false;
    s.status = 'active';
    s.kills = 0;
    return true;
  }

  complete(id: string): boolean {
    const s = this.state[id];
    if (!s || s.status !== 'ready') return false;
    s.status = 'done';
    for (const q of QUESTS) {
      if (q.requires === id && this.state[q.id].status === 'locked') this.state[q.id].status = 'available';
    }
    return true;
  }

  load(data: Record<string, QuestProgress>): void {
    this.reset();
    for (const q of QUESTS) {
      const d = data?.[q.id];
      if (d && ['locked', 'available', 'active', 'ready', 'done'].includes(d.status)) {
        this.state[q.id] = { status: d.status, kills: Math.max(0, Math.min(q.count, d.kills | 0)) };
      }
    }
    // unlock follow-ups of quests completed before they existed
    for (const q of QUESTS) {
      if (q.requires && this.state[q.requires]?.status === 'done' && this.state[q.id].status === 'locked') this.state[q.id].status = 'available';
    }
  }
}
