export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export type PlayerActionState =
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'SPRINT'
  | 'JUMP'
  | 'FALL'
  | 'GLIDE'
  | 'CLIMB'
  | 'DODGE'
  | 'ATTACK_LIGHT'
  | 'ATTACK_HEAVY'
  | 'BOW_AIM'
  | 'SWIMMING'
  | 'RIDE'
  | 'HIT_KNOCKBACK'
  | 'DEAD';

export type WeatherType = 'CLEAR' | 'RAIN' | 'THUNDER' | 'FOG' | 'SUNSET';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface ObstacleCollider {
  id?: string;
  type?: 'tree' | 'rock' | 'ruins' | 'shrine' | 'chest' | 'enemy' | 'mount' | 'prop';
  x: number;
  z: number;
  yBase: number;
  height: number;
  radius: number;
}

export interface PlayerStats {
  health: number;
  maxHealth: number; // in quarters of a heart (e.g. 12 = 3 full hearts)
  stamina: number; // 0 to 100
  maxStamina: number;
  rupees: number;
  arrows: number;
  level: number;
  xp: number;
  maxXp: number;
}

export type ItemType = 'weapon' | 'shield' | 'bow' | 'glider' | 'potion' | 'key' | 'valuable' | 'tool' | 'material' | 'building_part';

export type ToolType = 'axe' | 'pickaxe' | 'shovel' | 'sword' | 'hammer';
export type ToolTier = 'wood' | 'stone' | 'iron' | 'steel';

export interface CraftingIngredient {
  itemId: string;
  name: string;
  quantity: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  icon: string; // Lucide icon name or emoji
  attackPower?: number;
  defensePower?: number;
  restoreHealth?: number;
  restoreStamina?: number;
  equipped?: boolean;
  quantity: number;
  // Tool & Mining attributes
  toolType?: ToolType;
  toolTier?: ToolTier;
  durability?: number;
  maxDurability?: number;
  miningSpeed?: number; // Speed multiplier for harvesting
  // Building attributes
  buildingType?: string; // 'wall_wood' | 'wall_stone' | 'roof_wood' | 'pillar_wood' | 'bridge_wood' | 'fence_wood' | 'workbench' | 'campfire' | 'torch'
}

export interface CraftingRecipe {
  id: string;
  resultItem: InventoryItem;
  ingredients: CraftingIngredient[];
  requiresWorkbench?: boolean;
  category: 'tools' | 'building' | 'resources' | 'gear';
}

export interface BuildingStructure {
  id: string;
  type: string; // 'catan_road' | 'catan_settlement' | 'catan_city' | 'catan_knight_tower' | 'wall_wood' | 'wall_stone' | ...
  position: Vector3D;
  rotationY: number;
  health: number;
  maxHealth: number;
  level?: number; // 1 for Settlement, 2 for City/Festung
  isUpgraded?: boolean;
}

export interface HarvestableNode {
  id: string;
  type: 
    | 'tree_oak' 
    | 'tree_pine' 
    | 'tree_sakura' 
    | 'tree_birch' 
    | 'tree_apple' 
    | 'flower_silent_princess' 
    | 'shroom_cluster' 
    | 'berry_bush' 
    | 'rock_boulder' 
    | 'ore_iron' 
    | 'ore_gold' 
    | 'ore_crystal' 
    | 'clay_deposit' 
    | 'wheat_crop' 
    | 'wool_bush';
  position: Vector3D;
  health: number;
  maxHealth: number;
  requiredTool?: ToolType;
  minTier?: ToolTier;
  yieldItem: string;
  yieldQuantity: number;
  isFallen?: boolean;
  fallAngle?: number;
}

export type EnemyType = 'boblins' | 'slime' | 'stone_guardian' | 'stone_talus' | 'crystal_dragon' | 'goomba';

export interface EnemyState {
  id: string;
  type: EnemyType;
  name: string;
  position: Vector3D;
  rotation: number;
  health: number;
  maxHealth: number;
  level: number;
  state: 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'ATTACK' | 'HIT' | 'DEAD';
  targetDistance: number;
  velocity: Vector3D;
  attackCooldown: number;
  deathTimer?: number;
  isSquished?: boolean;
  squishProgress?: number;
}

export type MountType = 'horse' | 'zonai_glider';

export interface MountData {
  id: string;
  type: MountType;
  name: string;
  position: Vector3D;
  rotation: number;
  velocity: Vector3D;
  speed: number;
  maxSpeed: number;
  isMounted: boolean;
  stamina: number;
  maxStamina: number;
}

export type VehicleType = 'kart_classic' | 'kart_sport' | 'buggy_offroad' | 'hover_cycle';

export interface VehicleData {
  id: string;
  type: VehicleType;
  name: string;
  position: Vector3D;
  rotation: number;
  velocity: Vector3D;
  speed: number;
  maxSpeed: number;
  steerAngle: number;
  isDriving: boolean;
  isDrifting: boolean;
  driftStage: number; // 0 = none, 1 = blue mini-turbo, 2 = orange super, 3 = purple ultra
  turboTimer: number;
}

export interface WorldObjectType {
  id: string;
  type: 'chest' | 'shrine' | 'rupee' | 'apple' | 'potion' | 'npc' | 'crystal_node';
  name: string;
  position: Vector3D;
  opened?: boolean;
  activated?: boolean;
  dialogue?: string[];
  loot?: InventoryItem;
}

export interface ShrineData {
  id: string;
  name: string;
  region: string;
  position: Vector3D;
  activated: boolean;
  fastTravelUnlocked: boolean;
  description: string;
}

export interface DamageText {
  id: string;
  text: string;
  position: Vector3D;
  color: string;
  life: number; // 0 to 1
  critical?: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  completed: boolean;
  rewardRupees: number;
}

export type AvatarVariant = 'hylian_hero' | 'princess_zelda' | 'kitsune_beast' | 'dragon_warrior';

export interface WorldCreationOptions {
  name: string;
  seed: string;
  biome: 'hyrule' | 'snow' | 'desert' | 'volcano';
  template?: 'flat' | 'circuit_flat' | 'islands' | 'mountains' | 'procedural' | 'clear';
  timeOfDay: number; // 6.0, 12.0, 18.5, 23.0
  difficulty: 'explorer' | 'normal' | 'master';
  avatarVariant: AvatarVariant;
}

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  shadowsEnabled: boolean;
  grassDensity: number; // 0.2 to 1.0
  soundVolume: number; // 0 to 1
  musicVolume: number; // 0 to 1
  cameraSensitivity: number;
  invertY: boolean;
  touchControls: boolean;
  avatarVariant?: AvatarVariant;
  timeOfDay?: number; // 0.0 to 24.0
  isTimeCycleActive?: boolean; // Tag/Nacht-Zyklus automatisch weiterlaufen?
  timeCycleSpeed?: number; // Geschwindigkeits-Multiplikator (z.B. 0.5 bis 3.0)
}


