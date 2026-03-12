import type {
  PlanetCategory,
  StrategicPlannerAssignmentInput,
  StrategicPlannerDataset,
  StrategicPlannerMemberInput,
  StrategicPlannerRosterInput,
  StrategicPlannerSlotInput,
} from '@/lib/types/platoon-readiness';

type DemoMember = {
  memberId: string;
  allyCode: string;
  playerName: string;
};

type DemoUnit = {
  unitBaseId: string;
  unitName: string;
  relicTier: number;
  rarity?: number;
};

const DEMO_MEMBERS: DemoMember[] = [
  { memberId: 'demo-member-01', allyCode: '111111111', playerName: 'Ahsen' },
  { memberId: 'demo-member-02', allyCode: '111111112', playerName: 'Brakka' },
  { memberId: 'demo-member-03', allyCode: '111111113', playerName: 'Cadrin' },
  { memberId: 'demo-member-04', allyCode: '111111114', playerName: 'Darnel' },
  { memberId: 'demo-member-05', allyCode: '111111115', playerName: 'Eltar' },
  { memberId: 'demo-member-06', allyCode: '111111116', playerName: 'Fenn' },
  { memberId: 'demo-member-07', allyCode: '111111117', playerName: 'Garr' },
  { memberId: 'demo-member-08', allyCode: '111111118', playerName: 'Hark' },
  { memberId: 'demo-member-09', allyCode: '111111119', playerName: 'Ilex' },
  { memberId: 'demo-member-10', allyCode: '111111120', playerName: 'Joran' },
  { memberId: 'demo-member-11', allyCode: '111111121', playerName: 'Kest' },
  { memberId: 'demo-member-12', allyCode: '111111122', playerName: 'Lysa' },
  { memberId: 'demo-member-13', allyCode: '111111123', playerName: 'Merek' },
  { memberId: 'demo-member-14', allyCode: '111111124', playerName: 'Nyra' },
  { memberId: 'demo-member-15', allyCode: '111111125', playerName: 'Orrin' },
  { memberId: 'demo-member-16', allyCode: '111111126', playerName: 'Pyria' },
  { memberId: 'demo-member-17', allyCode: '111111127', playerName: 'Quinn' },
  { memberId: 'demo-member-18', allyCode: '111111128', playerName: 'Rhea' },
  { memberId: 'demo-member-19', allyCode: '111111129', playerName: 'Soren' },
  { memberId: 'demo-member-20', allyCode: '111111130', playerName: 'Talla' },
  { memberId: 'demo-member-21', allyCode: '111111131', playerName: 'Ulric' },
  { memberId: 'demo-member-22', allyCode: '111111132', playerName: 'Vesha' },
  { memberId: 'demo-member-23', allyCode: '111111133', playerName: 'Wren' },
  { memberId: 'demo-member-24', allyCode: '111111134', playerName: 'Xara' },
  { memberId: 'demo-member-25', allyCode: '111111135', playerName: 'Yaren' },
  { memberId: 'demo-member-26', allyCode: '111111136', playerName: 'Zella' },
];

const membersById = DEMO_MEMBERS.reduce<Record<string, DemoMember>>((accumulator, member) => {
  accumulator[member.memberId] = member;
  return accumulator;
}, {});

function own(memberId: string, units: DemoUnit[]): StrategicPlannerRosterInput[] {
  const member = membersById[memberId];
  if (!member) {
    throw new Error(`Unknown demo member: ${memberId}`);
  }

  return units.map((unit) => ({
    memberId: member.memberId,
    allyCode: member.allyCode,
    playerName: member.playerName,
    unitBaseId: unit.unitBaseId,
    unitName: unit.unitName,
    relicTier: unit.relicTier,
    rarity: unit.rarity ?? 7,
  }));
}

function buildZoneSlots(input: {
  phase: number;
  zoneKey: string;
  zoneName: string;
  zoneSortOrder: number;
  planetCategory: PlanetCategory;
  platoons: Array<{
    platoonNumber: number;
    slots: Array<{
      unitBaseId: string;
      unitName: string;
      requiredRelicTier: number;
      requiredRarity?: number;
    }>;
  }>;
}): StrategicPlannerSlotInput[] {
  return input.platoons.flatMap((platoon) => {
    const platoonKey = `${input.zoneKey}-platoon-${platoon.platoonNumber}`;

    return platoon.slots.map((slot, index) => ({
      phase: input.phase,
      zoneKey: input.zoneKey,
      zoneName: input.zoneName,
      zoneSortOrder: input.zoneSortOrder,
      platoonKey,
      platoonNumber: platoon.platoonNumber,
      platoonSortOrder: platoon.platoonNumber,
      slotKey: `${platoonKey}-slot-${index + 1}`,
      slotNumber: index + 1,
      unitBaseId: slot.unitBaseId,
      unitName: slot.unitName,
      requiredRelicTier: slot.requiredRelicTier,
      requiredRarity: slot.requiredRarity ?? 7,
      planetCategory: input.planetCategory,
    }));
  });
}

export function getDemoPlatoonReadinessDataset(): StrategicPlannerDataset {
  const slots: StrategicPlannerSlotInput[] = [
    ...buildZoneSlots({
      phase: 1,
      zoneKey: 'demo-p1-core-foundry',
      zoneName: 'Core Foundry',
      zoneSortOrder: 1,
      planetCategory: 'LS',
      platoons: [
        {
          platoonNumber: 1,
          slots: [
            { unitBaseId: 'CAPTAINREX', unitName: 'Captain Rex', requiredRelicTier: 7 },
            { unitBaseId: 'REX', unitName: 'CT-7567 "Rex"', requiredRelicTier: 5 },
            { unitBaseId: 'FIVES', unitName: 'CT-5555 "Fives"', requiredRelicTier: 5 },
            { unitBaseId: 'ECHO', unitName: 'CT-21-0408 "Echo"', requiredRelicTier: 5 },
          ],
        },
        {
          platoonNumber: 2,
          slots: [
            { unitBaseId: 'MONMOTHMA', unitName: 'Mon Mothma', requiredRelicTier: 5 },
            { unitBaseId: 'KYLEKATARN', unitName: 'Kyle Katarn', requiredRelicTier: 5 },
            { unitBaseId: 'HERASYNDULLAS3', unitName: 'Hera Syndulla', requiredRelicTier: 3 },
            { unitBaseId: 'CHOPPERS3', unitName: 'Chopper', requiredRelicTier: 3 },
          ],
        },
        {
          platoonNumber: 3,
          slots: [
            { unitBaseId: 'COMMANDERLUKESKYWALKER', unitName: 'Commander Luke Skywalker', requiredRelicTier: 5 },
            { unitBaseId: 'HANSOLO', unitName: 'Han Solo', requiredRelicTier: 5 },
            { unitBaseId: 'CHEWBACCALEGENDARY', unitName: 'Chewbacca', requiredRelicTier: 5 },
            { unitBaseId: 'C3POLEGENDARY', unitName: 'C-3PO', requiredRelicTier: 5 },
          ],
        },
      ],
    }),
    ...buildZoneSlots({
      phase: 2,
      zoneKey: 'demo-p2-shadow-research',
      zoneName: 'Shadow Research',
      zoneSortOrder: 2,
      planetCategory: 'DS',
      platoons: [
        {
          platoonNumber: 1,
          slots: [
            { unitBaseId: 'WATTAMBOR', unitName: 'Wat Tambor', requiredRelicTier: 7 },
            { unitBaseId: 'DARTHMALAK', unitName: 'Darth Malak', requiredRelicTier: 7 },
            { unitBaseId: 'DARTHTRAYA', unitName: 'Darth Traya', requiredRelicTier: 5 },
            { unitBaseId: 'DARTHNIHILUS', unitName: 'Darth Nihilus', requiredRelicTier: 5 },
          ],
        },
        {
          platoonNumber: 2,
          slots: [
            { unitBaseId: 'WATTAMBOR', unitName: 'Wat Tambor', requiredRelicTier: 7 },
            { unitBaseId: 'GEONOSIANBROODALPHA', unitName: 'Geonosian Brood Alpha', requiredRelicTier: 5 },
            { unitBaseId: 'POGGLETHELESSER', unitName: 'Poggle the Lesser', requiredRelicTier: 5 },
            { unitBaseId: 'NUTEGUNRAY', unitName: 'Nute Gunray', requiredRelicTier: 5 },
          ],
        },
        {
          platoonNumber: 3,
          slots: [
            { unitBaseId: 'DARTHMALAK', unitName: 'Darth Malak', requiredRelicTier: 7 },
            { unitBaseId: 'DARTHREVAN', unitName: 'Darth Revan', requiredRelicTier: 7 },
            { unitBaseId: 'BASTILASHANDARK', unitName: 'Bastila Shan (Fallen)', requiredRelicTier: 5 },
            { unitBaseId: 'HK47', unitName: 'HK-47', requiredRelicTier: 5 },
          ],
        },
      ],
    }),
    ...buildZoneSlots({
      phase: 3,
      zoneKey: 'demo-p3-mustafar-approach',
      zoneName: 'Mustafar Approach',
      zoneSortOrder: 3,
      planetCategory: 'MIX',
      platoons: [
        {
          platoonNumber: 1,
          slots: [
            { unitBaseId: 'THIRDSISTER', unitName: 'Third Sister', requiredRelicTier: 7 },
            { unitBaseId: 'JEDIKNIGHTLUKE', unitName: 'Jedi Knight Luke Skywalker', requiredRelicTier: 7 },
            { unitBaseId: 'GRANDINQUISITOR', unitName: 'Grand Inquisitor', requiredRelicTier: 7 },
            { unitBaseId: 'SEVENTHSISTER', unitName: 'Seventh Sister', requiredRelicTier: 5 },
          ],
        },
        {
          platoonNumber: 2,
          slots: [
            { unitBaseId: 'THIRDSISTER', unitName: 'Third Sister', requiredRelicTier: 7 },
            { unitBaseId: 'JEDIKNIGHTLUKE', unitName: 'Jedi Knight Luke Skywalker', requiredRelicTier: 7 },
            { unitBaseId: 'BOKATANMANDALORE', unitName: 'Bo-Katan Kryze (Mandalore)', requiredRelicTier: 7 },
            { unitBaseId: 'KELLERANBEQ', unitName: 'Kelleran Beq', requiredRelicTier: 5 },
          ],
        },
        {
          platoonNumber: 3,
          slots: [
            { unitBaseId: 'BOKATANMANDALORE', unitName: 'Bo-Katan Kryze (Mandalore)', requiredRelicTier: 7 },
            { unitBaseId: 'MORGANELSBETH', unitName: 'Morgan Elsbeth', requiredRelicTier: 5 },
            { unitBaseId: 'CAPTAINDROGAN', unitName: 'Captain Drogan', requiredRelicTier: 5 },
            { unitBaseId: 'REVA', unitName: 'Third Sister (Reva)', requiredRelicTier: 7 },
          ],
        },
      ],
    }),
    ...buildZoneSlots({
      phase: 4,
      zoneKey: 'demo-p4-holo-archives',
      zoneName: 'Holo Archives',
      zoneSortOrder: 4,
      planetCategory: 'SPECIAL',
      platoons: [
        {
          platoonNumber: 1,
          slots: [
            { unitBaseId: 'STARKILLER', unitName: 'Starkiller', requiredRelicTier: 7 },
            { unitBaseId: 'MERRIN', unitName: 'Merrin', requiredRelicTier: 7 },
            { unitBaseId: 'CEREJUNDA', unitName: 'Cere Junda', requiredRelicTier: 5 },
            { unitBaseId: 'CALKESTIS', unitName: 'Cal Kestis', requiredRelicTier: 5 },
          ],
        },
        {
          platoonNumber: 2,
          slots: [
            { unitBaseId: 'STARKILLER', unitName: 'Starkiller', requiredRelicTier: 7 },
            { unitBaseId: 'MERRIN', unitName: 'Merrin', requiredRelicTier: 7 },
            { unitBaseId: 'NIGHTSISTERZOMBIE', unitName: 'Nightsister Zombie', requiredRelicTier: 5 },
            { unitBaseId: 'TARONMALICOS', unitName: 'Taron Malicos', requiredRelicTier: 7 },
          ],
        },
        {
          platoonNumber: 3,
          slots: [
            { unitBaseId: 'CEREJUNDA', unitName: 'Cere Junda', requiredRelicTier: 5 },
            { unitBaseId: 'CALKESTIS', unitName: 'Cal Kestis', requiredRelicTier: 5 },
            { unitBaseId: 'DARTHTALON', unitName: 'Darth Talon', requiredRelicTier: 5 },
            { unitBaseId: 'CAPTAINDROGAN', unitName: 'Captain Drogan', requiredRelicTier: 5 },
          ],
        },
      ],
    }),
  ];

  const roster: StrategicPlannerRosterInput[] = [
    ...own('demo-member-01', [
      { unitBaseId: 'CAPTAINREX', unitName: 'Captain Rex', relicTier: 8 },
      { unitBaseId: 'REX', unitName: 'CT-7567 "Rex"', relicTier: 7 },
      { unitBaseId: 'FIVES', unitName: 'CT-5555 "Fives"', relicTier: 7 },
      { unitBaseId: 'ECHO', unitName: 'CT-21-0408 "Echo"', relicTier: 7 },
    ]),
    ...own('demo-member-02', [
      { unitBaseId: 'MONMOTHMA', unitName: 'Mon Mothma', relicTier: 6 },
      { unitBaseId: 'KYLEKATARN', unitName: 'Kyle Katarn', relicTier: 6 },
      { unitBaseId: 'HERASYNDULLAS3', unitName: 'Hera Syndulla', relicTier: 5 },
      { unitBaseId: 'CHOPPERS3', unitName: 'Chopper', relicTier: 5 },
    ]),
    ...own('demo-member-03', [
      { unitBaseId: 'COMMANDERLUKESKYWALKER', unitName: 'Commander Luke Skywalker', relicTier: 7 },
      { unitBaseId: 'HANSOLO', unitName: 'Han Solo', relicTier: 8 },
      { unitBaseId: 'CHEWBACCALEGENDARY', unitName: 'Chewbacca', relicTier: 7 },
      { unitBaseId: 'C3POLEGENDARY', unitName: 'C-3PO', relicTier: 7 },
    ]),
    ...own('demo-member-04', [
      { unitBaseId: 'CAPTAINREX', unitName: 'Captain Rex', relicTier: 7 },
      { unitBaseId: 'REX', unitName: 'CT-7567 "Rex"', relicTier: 5 },
      { unitBaseId: 'FIVES', unitName: 'CT-5555 "Fives"', relicTier: 5 },
      { unitBaseId: 'ECHO', unitName: 'CT-21-0408 "Echo"', relicTier: 5 },
    ]),
    ...own('demo-member-05', [
      { unitBaseId: 'MONMOTHMA', unitName: 'Mon Mothma', relicTier: 5 },
      { unitBaseId: 'KYLEKATARN', unitName: 'Kyle Katarn', relicTier: 5 },
      { unitBaseId: 'HERASYNDULLAS3', unitName: 'Hera Syndulla', relicTier: 5 },
      { unitBaseId: 'CHOPPERS3', unitName: 'Chopper', relicTier: 3 },
    ]),
    ...own('demo-member-06', [
      { unitBaseId: 'COMMANDERLUKESKYWALKER', unitName: 'Commander Luke Skywalker', relicTier: 5 },
      { unitBaseId: 'HANSOLO', unitName: 'Han Solo', relicTier: 6 },
      { unitBaseId: 'CHEWBACCALEGENDARY', unitName: 'Chewbacca', relicTier: 5 },
      { unitBaseId: 'C3POLEGENDARY', unitName: 'C-3PO', relicTier: 5 },
    ]),
    ...own('demo-member-07', [
      { unitBaseId: 'WATTAMBOR', unitName: 'Wat Tambor', relicTier: 8 },
      { unitBaseId: 'DARTHMALAK', unitName: 'Darth Malak', relicTier: 8 },
      { unitBaseId: 'DARTHTRAYA', unitName: 'Darth Traya', relicTier: 6 },
      { unitBaseId: 'DARTHREVAN', unitName: 'Darth Revan', relicTier: 7 },
    ]),
    ...own('demo-member-08', [
      { unitBaseId: 'DARTHMALAK', unitName: 'Darth Malak', relicTier: 6 },
      { unitBaseId: 'DARTHNIHILUS', unitName: 'Darth Nihilus', relicTier: 5 },
      { unitBaseId: 'BASTILASHANDARK', unitName: 'Bastila Shan (Fallen)', relicTier: 5 },
      { unitBaseId: 'HK47', unitName: 'HK-47', relicTier: 5 },
    ]),
    ...own('demo-member-09', [
      { unitBaseId: 'GEONOSIANBROODALPHA', unitName: 'Geonosian Brood Alpha', relicTier: 5 },
      { unitBaseId: 'POGGLETHELESSER', unitName: 'Poggle the Lesser', relicTier: 5 },
      { unitBaseId: 'NUTEGUNRAY', unitName: 'Nute Gunray', relicTier: 5 },
    ]),
    ...own('demo-member-10', [
      { unitBaseId: 'DARTHTRAYA', unitName: 'Darth Traya', relicTier: 4 },
      { unitBaseId: 'DARTHNIHILUS', unitName: 'Darth Nihilus', relicTier: 5 },
    ]),
    ...own('demo-member-11', [
      { unitBaseId: 'WATTAMBOR', unitName: 'Wat Tambor', relicTier: 6 },
      { unitBaseId: 'GEONOSIANBROODALPHA', unitName: 'Geonosian Brood Alpha', relicTier: 4 },
    ]),
    ...own('demo-member-12', [
      { unitBaseId: 'DARTHREVAN', unitName: 'Darth Revan', relicTier: 7 },
      { unitBaseId: 'BASTILASHANDARK', unitName: 'Bastila Shan (Fallen)', relicTier: 5 },
      { unitBaseId: 'HK47', unitName: 'HK-47', relicTier: 5 },
      { unitBaseId: 'NUTEGUNRAY', unitName: 'Nute Gunray', relicTier: 5 },
    ]),
    ...own('demo-member-13', [
      { unitBaseId: 'JEDIKNIGHTLUKE', unitName: 'Jedi Knight Luke Skywalker', relicTier: 8 },
      { unitBaseId: 'GRANDINQUISITOR', unitName: 'Grand Inquisitor', relicTier: 7 },
      { unitBaseId: 'THIRDSISTER', unitName: 'Third Sister', relicTier: 7 },
    ]),
    ...own('demo-member-14', [
      { unitBaseId: 'JEDIKNIGHTLUKE', unitName: 'Jedi Knight Luke Skywalker', relicTier: 6 },
      { unitBaseId: 'BOKATANMANDALORE', unitName: 'Bo-Katan Kryze (Mandalore)', relicTier: 6 },
      { unitBaseId: 'KELLERANBEQ', unitName: 'Kelleran Beq', relicTier: 5 },
      { unitBaseId: 'MORGANELSBETH', unitName: 'Morgan Elsbeth', relicTier: 5 },
    ]),
    ...own('demo-member-15', [
      { unitBaseId: 'BOKATANMANDALORE', unitName: 'Bo-Katan Kryze (Mandalore)', relicTier: 5 },
      { unitBaseId: 'CAPTAINDROGAN', unitName: 'Captain Drogan', relicTier: 3, rarity: 6 },
      { unitBaseId: 'THIRDSISTER', unitName: 'Third Sister', relicTier: 5 },
    ]),
    ...own('demo-member-16', [
      { unitBaseId: 'GRANDINQUISITOR', unitName: 'Grand Inquisitor', relicTier: 6 },
      { unitBaseId: 'KELLERANBEQ', unitName: 'Kelleran Beq', relicTier: 5 },
      { unitBaseId: 'MORGANELSBETH', unitName: 'Morgan Elsbeth', relicTier: 4 },
      { unitBaseId: 'SEVENTHSISTER', unitName: 'Seventh Sister', relicTier: 5 },
    ]),
    ...own('demo-member-17', [
      { unitBaseId: 'JEDIKNIGHTLUKE', unitName: 'Jedi Knight Luke Skywalker', relicTier: 7 },
      { unitBaseId: 'CAPTAINDROGAN', unitName: 'Captain Drogan', relicTier: 4, rarity: 7 },
    ]),
    ...own('demo-member-18', [
      { unitBaseId: 'BOKATANMANDALORE', unitName: 'Bo-Katan Kryze (Mandalore)', relicTier: 6 },
    ]),
    ...own('demo-member-19', [
      { unitBaseId: 'STARKILLER', unitName: 'Starkiller', relicTier: 7 },
      { unitBaseId: 'MERRIN', unitName: 'Merrin', relicTier: 7 },
      { unitBaseId: 'CEREJUNDA', unitName: 'Cere Junda', relicTier: 5 },
      { unitBaseId: 'CALKESTIS', unitName: 'Cal Kestis', relicTier: 5 },
    ]),
    ...own('demo-member-20', [
      { unitBaseId: 'STARKILLER', unitName: 'Starkiller', relicTier: 6 },
      { unitBaseId: 'MERRIN', unitName: 'Merrin', relicTier: 6 },
      { unitBaseId: 'CEREJUNDA', unitName: 'Cere Junda', relicTier: 5 },
      { unitBaseId: 'CALKESTIS', unitName: 'Cal Kestis', relicTier: 5 },
      { unitBaseId: 'DARTHTALON', unitName: 'Darth Talon', relicTier: 5 },
    ]),
    ...own('demo-member-21', [
      { unitBaseId: 'TARONMALICOS', unitName: 'Taron Malicos', relicTier: 6 },
    ]),
    ...own('demo-member-22', [
      { unitBaseId: 'CEREJUNDA', unitName: 'Cere Junda', relicTier: 5 },
      { unitBaseId: 'CALKESTIS', unitName: 'Cal Kestis', relicTier: 5 },
      { unitBaseId: 'NIGHTSISTERZOMBIE', unitName: 'Nightsister Zombie', relicTier: 5 },
    ]),
    ...own('demo-member-23', [
      { unitBaseId: 'TARONMALICOS', unitName: 'Taron Malicos', relicTier: 7 },
      { unitBaseId: 'STARKILLER', unitName: 'Starkiller', relicTier: 5 },
      { unitBaseId: 'MERRIN', unitName: 'Merrin', relicTier: 5 },
    ]),
    ...own('demo-member-24', [
      { unitBaseId: 'CEREJUNDA', unitName: 'Cere Junda', relicTier: 5 },
      { unitBaseId: 'CALKESTIS', unitName: 'Cal Kestis', relicTier: 5 },
      { unitBaseId: 'NIGHTSISTERZOMBIE', unitName: 'Nightsister Zombie', relicTier: 4 },
    ]),
    ...own('demo-member-25', [
      { unitBaseId: 'STARKILLER', unitName: 'Starkiller', relicTier: 7 },
    ]),
    ...own('demo-member-26', [
      { unitBaseId: 'MERRIN', unitName: 'Merrin', relicTier: 7 },
    ]),
  ];

  const members: StrategicPlannerMemberInput[] = DEMO_MEMBERS.map((member, index) => ({
    memberId: member.memberId,
    allyCode: member.allyCode,
    playerName: member.playerName,
    galacticPower: 8_300_000 - index * 45_000,
    lastSynced: '2026-03-11T18:45:00.000Z',
  }));

  const strategicAssignments: StrategicPlannerAssignmentInput[] = [
    {
      id: 'demo-target-01',
      guildId: null,
      guildMemberId: 'demo-member-11',
      unitBaseId: 'WATTAMBOR',
      planetCategory: 'DS',
      note: 'Close relic finish for repeated platoon demand.',
      createdByUserId: null,
      createdAt: '2026-03-09T12:00:00.000Z',
      updatedAt: '2026-03-09T12:00:00.000Z',
    },
    {
      id: 'demo-target-02',
      guildId: null,
      guildMemberId: 'demo-member-14',
      unitBaseId: 'JEDIKNIGHTLUKE',
      planetCategory: 'MIX',
      note: 'High-impact Phase 3 blocker.',
      createdByUserId: null,
      createdAt: '2026-03-10T09:15:00.000Z',
      updatedAt: '2026-03-10T09:15:00.000Z',
    },
    {
      id: 'demo-target-03',
      guildId: null,
      guildMemberId: 'demo-member-15',
      unitBaseId: 'CAPTAINDROGAN',
      planetCategory: 'SPECIAL',
      note: null,
      createdByUserId: null,
      createdAt: '2026-03-10T16:30:00.000Z',
      updatedAt: '2026-03-10T16:30:00.000Z',
    },
  ];

  return {
    mode: 'fixture',
    fixtureName: 'demo',
    guild: {
      id: null,
      name: 'Demo Guild Phoenix Reborn',
      slug: 'demo-guild-phoenix-reborn',
      memberCount: 50,
      rosteredMembers: DEMO_MEMBERS.length,
      rosterUnitCount: roster.length,
      lastRosterSync: '2026-03-11T18:45:00.000Z',
    },
    reference: {
      id: null,
      tbKey: 'rote',
      name: 'Rise of the Empire',
      totalPhases: 4,
      sourceVersion: 'fixture-demo-2026-03-12',
    },
    slots,
    roster,
    members,
    strategicAssignments,
    permissions: {
      canManageTargets: false,
    },
  };
}
