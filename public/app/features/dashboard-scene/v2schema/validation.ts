import * as z from 'zod';

import {
  type GridLayoutItemKind,
  type PanelKind,
  type QueryGroupKind,
  type VizConfigKind,
  type PanelQueryKind,
  type TransformationKind,
  type Spec as DashboardV2Spec,
} from '@grafana/schema/apis/dashboard.grafana.app/v2';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPanelQueryKind(value: unknown): value is PanelQueryKind {
  if (!isObject(value)) {
    return false;
  }
  if (value.kind !== 'PanelQuery' || !isObject(value.spec)) {
    return false;
  }
  // Minimal checks for query spec; accept additional properties
  if (typeof value.spec.refId !== 'string') {
    return false;
  }
  if (typeof value.spec.hidden !== 'boolean') {
    return false;
  }
  // value.spec.query is an opaque "DataQueryKind" which is { kind: string, spec: Record<string, any> }
  const q = value.spec.query;
  if (!isObject(q) || typeof q.kind !== 'string' || !isObject(q.spec)) {
    return false;
  }
  return true;
}

function isTransformationKind(value: unknown): value is TransformationKind {
  if (!isObject(value)) {
    return false;
  }
  if (typeof value.kind !== 'string') {
    return false;
  }
  if (!isObject(value.spec)) {
    return false;
  }
  return true;
}

function isQueryGroupKind(value: unknown): value is QueryGroupKind {
  if (!isObject(value)) {
    return false;
  }
  if (value.kind !== 'QueryGroup' || !isObject(value.spec)) {
    return false;
  }
  const spec = value.spec;
  if (!Array.isArray(spec.queries) || !spec.queries.every(isPanelQueryKind)) {
    return false;
  }
  if (!Array.isArray(spec.transformations) || !spec.transformations.every(isTransformationKind)) {
    return false;
  }
  if (!isObject(spec.queryOptions)) {
    return false;
  }
  return true;
}

function isVizConfigKind(value: unknown): value is VizConfigKind {
  if (!isObject(value)) {
    return false;
  }
  if (value.kind !== 'VizConfig') {
    return false;
  }
  if (typeof value.group !== 'string') {
    return false;
  }
  if (typeof value.version !== 'string') {
    return false;
  }
  if (!isObject(value.spec)) {
    return false;
  }
  const spec = value.spec;
  if (!isObject(spec.options)) {
    return false;
  }
  if (!isObject(spec.fieldConfig)) {
    return false;
  }
  // Minimal fieldConfig shape (defaults/overrides may be empty)
  if (!isObject(spec.fieldConfig)) {
    return false;
  }
  return true;
}

export function isPanelKindV2(value: unknown): value is PanelKind {
  if (!isObject(value)) {
    return false;
  }
  if (value.kind !== 'Panel') {
    return false;
  }
  if (!isObject(value.spec)) {
    return false;
  }
  const spec = value.spec;
  if (typeof spec.id !== 'number') {
    return false;
  }
  if (typeof spec.title !== 'string') {
    return false;
  }
  if (!Array.isArray(spec.links)) {
    return false;
  }
  if (!isQueryGroupKind(spec.data)) {
    return false;
  }
  if (!isVizConfigKind(spec.vizConfig)) {
    return false;
  }
  if (spec.transparent !== undefined && typeof spec.transparent !== 'boolean') {
    return false;
  }
  return true;
}

const ElementReferenceSchema = z.object({
  kind: z.literal('ElementReference'),
  name: z.string(),
});

const GridLayoutItemKindSchema = z.object({
  kind: z.literal('GridLayoutItem'),
  spec: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    element: ElementReferenceSchema,
  }),
}) satisfies z.ZodType<GridLayoutItemKind>;

export function isGridLayoutItemKind(value: unknown): value is GridLayoutItemKind {
  return GridLayoutItemKindSchema.safeParse(value).success;
}

/**
 * Returns the names referenced by more than one layout item in a dashboard's layout tree.
 *
 * A layout item may reference an element only once: panel repeats are kept as a single item
 * in the saved layout (the repeat expands at runtime), and rendering the same panel in several
 * places is what library panels are for. Deserializing duplicated references builds independent
 * panels with the same element id, which then drift apart on edit and overwrite each other on
 * save, so the schema must not accept them.
 */
export function findDuplicateElementReferences(spec: DashboardV2Spec): string[] {
  const names: string[] = [];

  const collect = (layout: DashboardV2Spec['layout'] | undefined): void => {
    if (!layout) {
      return;
    }
    switch (layout.kind) {
      case 'GridLayout':
        for (const item of layout.spec.items) {
          if (item.kind === 'GridLayoutItem') {
            names.push(item.spec.element.name);
          }
        }
        break;
      case 'AutoGridLayout':
        for (const item of layout.spec.items) {
          if (item.kind === 'AutoGridLayoutItem') {
            names.push(item.spec.element.name);
          }
        }
        break;
      case 'TabsLayout':
        for (const tab of layout.spec.tabs) {
          collect(tab.spec.layout);
        }
        break;
      case 'RowsLayout':
        for (const row of layout.spec.rows) {
          collect(row.spec.layout);
        }
        break;
    }
  };

  collect(spec.layout);

  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([name, count]) => name !== '' && count > 1).map(([name]) => name);
}
