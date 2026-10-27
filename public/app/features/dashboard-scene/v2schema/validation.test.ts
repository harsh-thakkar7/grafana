import {
  defaultPanelKind,
  defaultQueryGroupKind,
  defaultPanelQueryKind,
  defaultVizConfigKind,
  defaultGridLayoutItemKind,
  defaultSpec as defaultDashboardV2Spec,
  type Spec as DashboardV2Spec,
} from '@grafana/schema/apis/dashboard.grafana.app/v2';

import { findDuplicateElementReferences, isGridLayoutItemKind, isPanelKindV2 } from './validation';

describe('v2schema validation', () => {
  it('isPanelKindV2 returns true for a minimal valid PanelKind', () => {
    const panel = defaultPanelKind();
    // Ensure minimal required properties exist (defaults should be fine)
    panel.spec.vizConfig = defaultVizConfigKind();
    panel.spec.data = defaultQueryGroupKind();

    expect(isPanelKindV2(panel)).toBe(true);
  });

  it('returns false when kind is not "Panel"', () => {
    const panel = defaultPanelKind();
    // @ts-expect-error intentional invalid kind for test
    panel.kind = 'NotAPanel';
    expect(isPanelKindV2(panel)).toBe(false);
  });

  it('returns false when data kind is wrong', () => {
    const panel = defaultPanelKind();
    // @ts-expect-error intentional invalid kind for test
    panel.spec.data = { kind: 'Wrong', spec: {} };
    expect(isPanelKindV2(panel)).toBe(false);
  });

  it('returns false when queries contain invalid entries', () => {
    const panel = defaultPanelKind();
    panel.spec.data = defaultQueryGroupKind();
    // @ts-expect-error push an invalid query shape
    panel.spec.data.spec.queries = [{}];
    expect(isPanelKindV2(panel)).toBe(false);

    // Ensure a valid query shape passes
    panel.spec.data.spec.queries = [defaultPanelQueryKind()];
    expect(isPanelKindV2(panel)).toBe(true);
  });

  it('returns false when vizConfig.group is not a string', () => {
    const panel = defaultPanelKind();
    panel.spec.vizConfig = defaultVizConfigKind();
    // @ts-expect-error force wrong type
    panel.spec.vizConfig.group = 42;
    expect(isPanelKindV2(panel)).toBe(false);
  });

  it('returns false when transparent is not a boolean', () => {
    const panel = defaultPanelKind();
    // @ts-expect-error wrong type
    panel.spec.transparent = 'yes';
    expect(isPanelKindV2(panel)).toBe(false);
  });
});

describe('isGridLayoutItemKind', () => {
  it('returns true for a valid GridLayoutItemKind', () => {
    const item = defaultGridLayoutItemKind();
    item.spec.x = 0;
    item.spec.y = 0;
    item.spec.width = 12;
    item.spec.height = 8;
    item.spec.element = { kind: 'ElementReference', name: 'panel-1' };

    expect(isGridLayoutItemKind(item)).toBe(true);
  });

  it.each([
    ['kind is not GridLayoutItem', { kind: 'NotAGridLayoutItem' }],
    ['x is not a number', { spec: { x: '0' } }],
    ['y is not a number', { spec: { y: null } }],
    ['width is not a number', { spec: { width: undefined } }],
    ['height is not a number', { spec: { height: {} } }],
    ['element is missing', { spec: { element: undefined } }],
    ['element.kind is not ElementReference', { spec: { element: { kind: 'WrongKind', name: 'panel-1' } } }],
    ['element.name is not a string', { spec: { element: { kind: 'ElementReference', name: 123 } } }],
  ])('returns false when %s', (_, override) => {
    const item = {
      ...defaultGridLayoutItemKind(),
      spec: {
        ...defaultGridLayoutItemKind().spec,
        element: { kind: 'ElementReference', name: 'panel-1' },
        ...((override as Record<string, unknown>).spec ?? {}),
      },
      ...Object.fromEntries(Object.entries(override).filter(([key]) => key !== 'spec')),
    };
    expect(isGridLayoutItemKind(item)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'string'],
    ['number', 123],
  ])('returns false for %s', (_, value) => {
    expect(isGridLayoutItemKind(value)).toBe(false);
  });
});

describe('findDuplicateElementReferences', () => {
  const gridItems = (names: string[]) =>
    names.map((name) => ({
      kind: 'GridLayoutItem' as const,
      spec: { x: 0, y: 0, width: 12, height: 8, element: { kind: 'ElementReference' as const, name } },
    }));

  const spec = (layout: DashboardV2Spec['layout']): DashboardV2Spec => {
    return { ...defaultDashboardV2Spec(), layout } as DashboardV2Spec;
  };

  it('returns [] when each element is referenced once', () => {
    const layout: DashboardV2Spec['layout'] = {
      kind: 'GridLayout',
      spec: { items: gridItems(['panel-1', 'panel-2']) },
    };
    expect(findDuplicateElementReferences(spec(layout))).toEqual([]);
  });

  it('returns [] for an empty layout', () => {
    expect(findDuplicateElementReferences(spec({ kind: 'GridLayout', spec: { items: [] } }))).toEqual([]);
  });

  it('flags an element referenced by two items in the same grid', () => {
    const layout: DashboardV2Spec['layout'] = {
      kind: 'GridLayout',
      spec: { items: gridItems(['panel-1', 'panel-2', 'panel-1']) },
    };
    expect(findDuplicateElementReferences(spec(layout))).toEqual(['panel-1']);
  });

  it('flags an element referenced from two tabs', () => {
    const layout: DashboardV2Spec['layout'] = {
      kind: 'TabsLayout',
      spec: {
        tabs: [
          {
            kind: 'TabsLayoutTab',
            spec: { title: 'Tab 1', layout: { kind: 'GridLayout', spec: { items: gridItems(['panel-1']) } } },
          },
          {
            kind: 'TabsLayoutTab',
            spec: { title: 'Tab 2', layout: { kind: 'GridLayout', spec: { items: gridItems(['panel-1']) } } },
          },
        ],
      },
    };
    expect(findDuplicateElementReferences(spec(layout))).toEqual(['panel-1']);
  });

  it('flags an element referenced from two rows', () => {
    const layout: DashboardV2Spec['layout'] = {
      kind: 'RowsLayout',
      spec: {
        rows: [
          {
            kind: 'RowsLayoutRow',
            spec: { title: 'Row 1', layout: { kind: 'GridLayout', spec: { items: gridItems(['panel-1']) } } },
          },
          {
            kind: 'RowsLayoutRow',
            spec: { title: 'Row 2', layout: { kind: 'GridLayout', spec: { items: gridItems(['panel-1']) } } },
          },
        ],
      },
    };
    expect(findDuplicateElementReferences(spec(layout))).toEqual(['panel-1']);
  });

  it('flags duplicates found at different nesting depths', () => {
    const layout: DashboardV2Spec['layout'] = {
      kind: 'RowsLayout',
      spec: {
        rows: [
          {
            kind: 'RowsLayoutRow',
            spec: { title: 'Row 1', layout: { kind: 'GridLayout', spec: { items: gridItems(['panel-1']) } } },
          },
          {
            kind: 'RowsLayoutRow',
            spec: {
              title: 'Row 2',
              layout: {
                kind: 'TabsLayout',
                spec: {
                  tabs: [
                    {
                      kind: 'TabsLayoutTab',
                      spec: { title: 'Tab 1', layout: { kind: 'GridLayout', spec: { items: gridItems(['panel-1']) } } },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    };
    expect(findDuplicateElementReferences(spec(layout))).toEqual(['panel-1']);
  });

  it('ignores layouts with no references at all', () => {
    expect(findDuplicateElementReferences(spec({ kind: 'RowsLayout', spec: { rows: [] } }))).toEqual([]);
  });
});
