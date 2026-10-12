import { CraftingRecipe, InventoryItem } from '../types';

export class CraftingSystem {
  public static RECIPES: CraftingRecipe[] = [
    // -------------------------------------------------------------
    // 1. Resources & Components
    // -------------------------------------------------------------
    {
      id: 'recipe_planks',
      category: 'resources',
      requiresWorkbench: false,
      resultItem: {
        id: 'mat_wood_plank',
        name: 'Holzplanke',
        type: 'material',
        description: 'Verarbeitete Holzplanke für Bauwerke.',
        icon: '🪵',
        quantity: 2,
      },
      ingredients: [{ itemId: 'Eichenholz', name: 'Eichenholz', quantity: 1 }],
    },
    {
      id: 'recipe_sticks',
      category: 'resources',
      requiresWorkbench: false,
      resultItem: {
        id: 'mat_stick',
        name: 'Stock',
        type: 'material',
        description: 'Holzstock für Griffe und Fackeln.',
        icon: '🥢',
        quantity: 4,
      },
      ingredients: [{ itemId: 'Eichenholz', name: 'Eichenholz', quantity: 1 }],
    },
    {
      id: 'recipe_torch',
      category: 'resources',
      requiresWorkbench: false,
      resultItem: {
        id: 'item_torch',
        name: 'Fackel',
        type: 'building_part',
        buildingType: 'torch',
        description: 'Spendet warmes Licht in der Dunkelheit.',
        icon: '🔦',
        quantity: 2,
      },
      ingredients: [
        { itemId: 'Stock', name: 'Stock', quantity: 1 },
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 1 },
      ],
    },
    {
      id: 'recipe_campfire',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_campfire',
        name: 'Lagerfeuer',
        type: 'building_part',
        buildingType: 'campfire',
        description: 'Spendet Wärme, Licht und Gemütlichkeit.',
        icon: '🔥',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 5 },
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 3 },
      ],
    },
    // -------------------------------------------------------------
    // Catan Building Blueprints (Die Siedler von Catan)
    // -------------------------------------------------------------
    {
      id: 'recipe_catan_road',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_catan_road',
        name: 'Catan-Straße',
        type: 'building_part',
        buildingType: 'catan_road',
        description: 'Pflasterweg mit Laterne. Erhöht das Lauftempo um +25%.',
        icon: '🛤️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Holz', name: 'Holz / Eichenholz', quantity: 1 },
        { itemId: 'Lehm', name: 'Lehm', quantity: 1 },
      ],
    },
    {
      id: 'recipe_catan_settlement',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_catan_settlement',
        name: 'Catan-Siedlung (Stufe 1)',
        type: 'building_part',
        buildingType: 'catan_settlement',
        description: 'Siedler-Unterkunft mit Lagerfeuer, Erholung & Schnellreise.',
        icon: '🛖',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Holz', name: 'Holz / Eichenholz', quantity: 1 },
        { itemId: 'Lehm', name: 'Lehm', quantity: 1 },
        { itemId: 'Getreide', name: 'Getreide', quantity: 1 },
        { itemId: 'Wolle', name: 'Wolle', quantity: 1 },
      ],
    },
    {
      id: 'recipe_catan_knight_tower',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_catan_knight_tower',
        name: 'Ritter-Wachturm',
        type: 'building_part',
        buildingType: 'catan_knight_tower',
        description: 'Abwehrturm mit Wächter-Kristall, der nahe Feinde angreift.',
        icon: '🛡️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Erz', name: 'Erz / Eisenerz', quantity: 1 },
        { itemId: 'Wolle', name: 'Wolle', quantity: 1 },
        { itemId: 'Getreide', name: 'Getreide', quantity: 1 },
      ],
    },
    {
      id: 'recipe_catan_city',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_catan_city',
        name: 'Catan-Stadt (Stufe 2 Ausbau)',
        type: 'building_part',
        buildingType: 'catan_city',
        description: 'Erweitert eine Siedlung zur gewaltigen Festungsstadt!',
        icon: '🏰',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Erz', name: 'Erz / Eisenerz', quantity: 3 },
        { itemId: 'Getreide', name: 'Getreide', quantity: 2 },
      ],
    },

    // -------------------------------------------------------------
    // 2. Base Wooden & Stone Tools
    // -------------------------------------------------------------
    {
      id: 'recipe_axe_wood',
      category: 'tools',
      requiresWorkbench: false,
      resultItem: {
        id: 'tool_axe_wood',
        name: 'Holzaxt',
        type: 'tool',
        toolType: 'axe',
        toolTier: 'wood',
        durability: 30,
        maxDurability: 30,
        miningSpeed: 1.5,
        description: 'Einfache Holzaxt zum Fällen von Bäumen.',
        icon: '🪓',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 3 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_pickaxe_wood',
      category: 'tools',
      requiresWorkbench: false,
      resultItem: {
        id: 'tool_pickaxe_wood',
        name: 'Holzspitzhacke',
        type: 'tool',
        toolType: 'pickaxe',
        toolTier: 'wood',
        durability: 30,
        maxDurability: 30,
        miningSpeed: 1.5,
        description: 'Einfache Holzspitzhacke zum Abbauen von Gestein.',
        icon: '⛏️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 3 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_shovel_wood',
      category: 'tools',
      requiresWorkbench: false,
      resultItem: {
        id: 'tool_shovel_wood',
        name: 'Holzschaufel',
        type: 'tool',
        toolType: 'shovel',
        toolTier: 'wood',
        durability: 25,
        maxDurability: 25,
        miningSpeed: 1.5,
        description: 'Zum Graben von Löchern & Aufschütten von Erde.',
        icon: '🧹',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 2 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_axe_stone',
      category: 'tools',
      requiresWorkbench: false,
      resultItem: {
        id: 'tool_axe_stone',
        name: 'Steinaxt',
        type: 'tool',
        toolType: 'axe',
        toolTier: 'stone',
        durability: 60,
        maxDurability: 60,
        miningSpeed: 2.5,
        description: 'Robuste Steinaxt mit höherer Haltbarkeit.',
        icon: '🪓',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 3 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_pickaxe_stone',
      category: 'tools',
      requiresWorkbench: false,
      resultItem: {
        id: 'tool_pickaxe_stone',
        name: 'Steinspitzhacke',
        type: 'tool',
        toolType: 'pickaxe',
        toolTier: 'stone',
        durability: 60,
        maxDurability: 60,
        miningSpeed: 2.5,
        description: 'Baut Erze wie Eisenerz und Golderz ab.',
        icon: '⛏️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 3 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },

    // -------------------------------------------------------------
    // 3. Iron & Special Tools (Workbench Required)
    // -------------------------------------------------------------
    {
      id: 'recipe_axe_iron',
      category: 'tools',
      requiresWorkbench: true,
      resultItem: {
        id: 'tool_axe_iron',
        name: 'Eisenaxt',
        type: 'tool',
        toolType: 'axe',
        toolTier: 'iron',
        durability: 140,
        maxDurability: 140,
        miningSpeed: 4.0,
        description: 'Scharfe Eisenaxt. Fällt Bäume blitzschnell.',
        icon: '🪓',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eisenerz', name: 'Eisenerz', quantity: 3 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_pickaxe_iron',
      category: 'tools',
      requiresWorkbench: true,
      resultItem: {
        id: 'tool_pickaxe_iron',
        name: 'Eisenspitzhacke',
        type: 'tool',
        toolType: 'pickaxe',
        toolTier: 'iron',
        durability: 150,
        maxDurability: 150,
        miningSpeed: 4.5,
        description: 'Baut seltenste Kristall-Geoden mühelos ab.',
        icon: '⛏️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eisenerz', name: 'Eisenerz', quantity: 3 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_sword_crystal',
      category: 'gear',
      requiresWorkbench: true,
      resultItem: {
        id: 'weapon_crystal_blade',
        name: 'Kristallklinge',
        type: 'weapon',
        attackPower: 38,
        durability: 200,
        maxDurability: 200,
        description: 'Legendäre Klinge, durchdrungen mit magischen Kristallen.',
        icon: '⚔️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Kristall', name: 'Kristall', quantity: 2 },
        { itemId: 'Eisenerz', name: 'Eisenerz', quantity: 2 },
        { itemId: 'Stock', name: 'Stock', quantity: 1 },
      ],
    },

    // -------------------------------------------------------------
    // 4. Building Components
    // -------------------------------------------------------------
    {
      id: 'recipe_wall_wood',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_wall_wood',
        name: 'Holzwand',
        type: 'building_part',
        buildingType: 'wall_wood',
        description: 'Stabile Holzwand für Hütten & Unterstände.',
        icon: '🪵',
        quantity: 1,
      },
      ingredients: [{ itemId: 'Holzplanke', name: 'Holzplanke', quantity: 4 }],
    },
    {
      id: 'recipe_wall_stone',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_wall_stone',
        name: 'Steinwand',
        type: 'building_part',
        buildingType: 'wall_stone',
        description: 'Massive Festungswand aus behauenem Stein.',
        icon: '🧱',
        quantity: 1,
      },
      ingredients: [{ itemId: 'Rohstein', name: 'Rohstein', quantity: 5 }],
    },
    {
      id: 'recipe_roof_wood',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_roof_wood',
        name: 'Holzdach',
        type: 'building_part',
        buildingType: 'roof_wood',
        description: 'Schräges Holzdach zum Schutz vor Regen.',
        icon: '🏠',
        quantity: 1,
      },
      ingredients: [{ itemId: 'Holzplanke', name: 'Holzplanke', quantity: 3 }],
    },
    {
      id: 'recipe_pillar_wood',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_pillar_wood',
        name: 'Holzsäule',
        type: 'building_part',
        buildingType: 'pillar_wood',
        description: 'Tragende Holzsäule für Dächer & Balkone.',
        icon: '🏛️',
        quantity: 1,
      },
      ingredients: [{ itemId: 'Eichenholz', name: 'Eichenholz', quantity: 2 }],
    },
    {
      id: 'recipe_bridge_wood',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_bridge_wood',
        name: 'Holzbrücke / Boden',
        type: 'building_part',
        buildingType: 'bridge_wood',
        description: 'Flacher Holzsteg zum Überqueren von Abgründen.',
        icon: '🌉',
        quantity: 1,
      },
      ingredients: [{ itemId: 'Holzplanke', name: 'Holzplanke', quantity: 3 }],
    },
    {
      id: 'recipe_fence_wood',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_fence_wood',
        name: 'Holzzaun Barrikade',
        type: 'building_part',
        buildingType: 'fence_wood',
        description: 'Hält wilde Ungeheuer und Monster auf Distanz.',
        icon: '🚧',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Holzplanke', name: 'Holzplanke', quantity: 2 },
        { itemId: 'Stock', name: 'Stock', quantity: 2 },
      ],
    },
    {
      id: 'recipe_windmill',
      category: 'building',
      requiresWorkbench: true,
      resultItem: {
        id: 'build_windmill',
        name: 'Windmühle',
        type: 'building_part',
        buildingType: 'windmill',
        description: 'Majestätische Windmühle mit rotierenden Flügeln.',
        icon: '🌾',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Holzplanke', name: 'Holzplanke', quantity: 6 },
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 6 },
        { itemId: 'Wolle', name: 'Wolle / Stoff', quantity: 2 },
      ],
    },
    {
      id: 'recipe_watchtower',
      category: 'building',
      requiresWorkbench: true,
      resultItem: {
        id: 'build_watchtower',
        name: 'Holz-Wachturm',
        type: 'building_part',
        buildingType: 'watchtower',
        description: 'Hoher Aussichtspunkt mit Plattform und Laterne.',
        icon: '🗼',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 5 },
        { itemId: 'Holzplanke', name: 'Holzplanke', quantity: 4 },
        { itemId: 'Stock', name: 'Stock', quantity: 4 },
      ],
    },
    {
      id: 'recipe_stone_well',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_stone_well',
        name: 'Dorfbrunnen',
        type: 'building_part',
        buildingType: 'stone_well',
        description: 'Steinbrunnen mit Eimer, Seil und Holzdach.',
        icon: '💧',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 6 },
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 2 },
      ],
    },
    {
      id: 'recipe_lantern_post',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_lantern_post',
        name: 'Straßenlaterne',
        type: 'building_part',
        buildingType: 'lantern_post',
        description: 'Gusseiserne Laterne mit warmem Umgebungslicht.',
        icon: '🏮',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eisenerz', name: 'Eisenerz', quantity: 2 },
        { itemId: 'Rohstein', name: 'Rohstein', quantity: 1 },
      ],
    },
    {
      id: 'recipe_camp_tent',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_camp_tent',
        name: 'Reiselager-Zelt',
        type: 'building_part',
        buildingType: 'camp_tent',
        description: 'Gemütliches Zelt mit Strohmatte & Decke.',
        icon: '⛺',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Stock', name: 'Stock', quantity: 4 },
        { itemId: 'Wolle', name: 'Wolle / Stoff', quantity: 3 },
      ],
    },
    {
      id: 'recipe_barrel_stack',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_barrel_stack',
        name: 'Holzfässer-Stapel',
        type: 'building_part',
        buildingType: 'barrel_stack',
        description: '3 gestapelte Eichenholzfässer mit Eisenreifen.',
        icon: '🛢️',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Eichenholz', name: 'Eichenholz', quantity: 3 },
        { itemId: 'Eisenerz', name: 'Eisenerz', quantity: 1 },
      ],
    },
    {
      id: 'recipe_crate_wooden',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_crate_wooden',
        name: 'Holzkiste',
        type: 'building_part',
        buildingType: 'crate_wooden',
        description: 'Verstärkte Holzkiste zur Lagerung von Vorräten.',
        icon: '📦',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Holzplanke', name: 'Holzplanke', quantity: 3 },
      ],
    },
    {
      id: 'recipe_target_dummy',
      category: 'building',
      requiresWorkbench: false,
      resultItem: {
        id: 'build_target_dummy',
        name: 'Übungspuppe',
        type: 'building_part',
        buildingType: 'target_dummy',
        description: 'Strohreiter zum Trainieren von Schwert & Bogen.',
        icon: '🎯',
        quantity: 1,
      },
      ingredients: [
        { itemId: 'Stock', name: 'Stock', quantity: 3 },
        { itemId: 'Getreide', name: 'Getreide / Stroh', quantity: 2 },
      ],
    },
  ];

  private static findInventoryItem(ingKey: string, ingName: string, inventory: InventoryItem[]): InventoryItem | undefined {
    const keyLower = ingKey.toLowerCase();
    const nameLower = ingName.toLowerCase();

    return inventory.find((item) => {
      const iName = item.name.toLowerCase();
      const iId = item.id.toLowerCase();

      if (iId === keyLower || iName === nameLower) return true;
      if (keyLower.includes('holz') && (iName.includes('holz') || iId.includes('wood'))) return true;
      if (keyLower.includes('erz') && (iName.includes('erz') || iName.includes('stein') || iId.includes('stone') || iId.includes('ore'))) return true;
      if (keyLower.includes('lehm') && iName.includes('lehm')) return true;
      if (keyLower.includes('getreide') && (iName.includes('getreide') || iName.includes('weizen'))) return true;
      if (keyLower.includes('wolle') && iName.includes('wolle')) return true;
      return false;
    });
  }

  /**
   * Check if player has all ingredients required for a recipe
   */
  public static canCraft(recipe: CraftingRecipe, inventory: InventoryItem[], isNearWorkbench: boolean): { can: boolean; reason?: string } {
    if (recipe.requiresWorkbench && !isNearWorkbench) {
      return { can: false, reason: 'Werkbank benötigt!' };
    }

    for (const ing of recipe.ingredients) {
      const invItem = this.findInventoryItem(ing.itemId, ing.name, inventory);
      const count = invItem ? invItem.quantity : 0;
      if (count < ing.quantity) {
        return { can: false, reason: `Nicht genug ${ing.name} (${count}/${ing.quantity})` };
      }
    }

    return { can: true };
  }

  /**
   * Craft a recipe: deduct ingredients and add output item to inventory
   */
  public static craftRecipe(recipe: CraftingRecipe, inventory: InventoryItem[], isNearWorkbench: boolean): { success: boolean; message: string } {
    const check = this.canCraft(recipe, inventory, isNearWorkbench);
    if (!check.can) {
      return { success: false, message: check.reason || 'Crafting fehlgeschlagen!' };
    }

    // Deduct ingredients
    for (const ing of recipe.ingredients) {
      const invItem = this.findInventoryItem(ing.itemId, ing.name, inventory);
      if (invItem) {
        invItem.quantity -= ing.quantity;
        if (invItem.quantity <= 0) {
          const idx = inventory.indexOf(invItem);
          if (idx >= 0) inventory.splice(idx, 1);
        }
      }
    }

    // Add crafted item output
    const output = { ...recipe.resultItem };
    const existing = inventory.find((i) => i.name === output.name && i.type === output.type);

    if (existing) {
      existing.quantity += output.quantity;
    } else {
      inventory.push(output);
    }

    return { success: true, message: `${output.quantity}x ${output.name} hergestellt!` };
  }
}
