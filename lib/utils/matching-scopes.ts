import type {
  IgnoredMatchingScope,
  PlanetCategory,
  StrategicPlannerSlotInput,
} from '@/lib/types/platoon-readiness';

export const MATCHING_SCOPE_CATEGORY_ORDER: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

export function getMatchingCategoryLabel(category: PlanetCategory): string {
  return category === 'SPECIAL' ? 'Bonus' : category;
}

export function getIgnoredMatchingScopeKey(scope: IgnoredMatchingScope): string {
  return `${scope.phase}::${scope.category}`;
}

export function formatIgnoredMatchingScopeLabel(scope: IgnoredMatchingScope): string {
  return `P${scope.phase} · ${getMatchingCategoryLabel(scope.category)}`;
}

export function normalizeIgnoredMatchingScopes(
  scopes: IgnoredMatchingScope[],
): IgnoredMatchingScope[] {
  const seen = new Set<string>();

  return scopes
    .filter((scope) => Number.isFinite(scope.phase) && scope.phase > 0)
    .filter((scope) => {
      const key = getIgnoredMatchingScopeKey(scope);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .toSorted((left, right) => {
      if (left.phase !== right.phase) {
        return left.phase - right.phase;
      }

      return (
        MATCHING_SCOPE_CATEGORY_ORDER.indexOf(left.category) -
        MATCHING_SCOPE_CATEGORY_ORDER.indexOf(right.category)
      );
    });
}

export function isIgnoredMatchingScope(
  ignoredScopes: IgnoredMatchingScope[],
  scope: IgnoredMatchingScope,
): boolean {
  const key = getIgnoredMatchingScopeKey(scope);
  return ignoredScopes.some((entry) => getIgnoredMatchingScopeKey(entry) === key);
}

export function filterSlotsByIgnoredMatchingScopes(
  slots: StrategicPlannerSlotInput[],
  ignoredScopes: IgnoredMatchingScope[],
): StrategicPlannerSlotInput[] {
  if (ignoredScopes.length === 0) {
    return slots;
  }

  const ignoredKeys = new Set(
    ignoredScopes.map((scope) => getIgnoredMatchingScopeKey(scope)),
  );

  return slots.filter((slot) => {
    if (!slot.planetCategory) {
      return true;
    }

    return !ignoredKeys.has(
      getIgnoredMatchingScopeKey({
        phase: slot.phase,
        category: slot.planetCategory,
      }),
    );
  });
}
