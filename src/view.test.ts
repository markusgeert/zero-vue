import type { Query, Schema } from '@rocicorp/zero'

import { resolver } from '@rocicorp/resolver'
import {
  createSchema,
  number,
  relationships,
  string,
  table,
  Zero,
} from '@rocicorp/zero'
import { expect, it, vi } from 'vitest'
import { VueView, vueViewFactory } from './view'

const simpleSchema = createSchema({
  tables: [
    table('table')
      .columns({
        a: number(),
        b: string(),
      })
      .primaryKey('a'),
  ],
})

const recursiveTable = table('table')
  .columns({
    id: number(),
    name: string(),
    data: string().optional(),
    childID: number().optional(),
  })
  .primaryKey('id')
const treeSchema = createSchema({
  tables: [recursiveTable],
  relationships: [
    relationships(recursiveTable, ({ many }) => ({
      children: many({
        sourceField: ['childID'],
        destSchema: recursiveTable,
        destField: ['id'],
      }),
    })),
  ],
})

const issue = table('issue')
  .columns({
    id: number(),
    name: string(),
  })
  .primaryKey('id')

const label = table('label')
  .columns({
    id: number(),
    name: string(),
  })
  .primaryKey('id')

const issueLabel = table('issueLabel')
  .columns({
    id: number(),
    issueID: number(),
    labelID: number(),
    extra: string(),
  })
  .primaryKey('id')

const collapseSchema = createSchema({
  tables: [issue, label, issueLabel],
  relationships: [
    relationships(issue, ({ many }) => ({
      labels: many(
        {
          sourceField: ['id'],
          destSchema: issueLabel,
          destField: ['issueID'],
        },
        {
          sourceField: ['labelID'],
          destSchema: label,
          destField: ['id'],
        },
      ),
    })),
  ],
})

async function setupTestEnvironment<S extends Schema>(schema: S) {
  const z = new Zero({
    userID: 'asdf',
    server: null,
    schema,
    // This is often easier to develop with if you're frequently changing
    // the schema. Switch to 'idb' for local-persistence.
    kvStore: 'mem',
  })

  return { z }
}

it('basics', async () => {
  const { z } = await setupTestEnvironment(simpleSchema)
  const tableQuery = z.query.table

  await z.mutate.table.insert({ a: 1, b: 'a' })
  await z.mutate.table.insert({ a: 2, b: 'b' })

  const view = tableQuery.materialize(vueViewFactory)

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
    ]
  `)

  // TODO: Test with a real resolver
  // expect(view.status).toEqual("complete");

  await z.mutate.table.insert({ a: 3, b: 'c' })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
      {
        "a": 3,
        "b": "c",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.delete({ a: 1 })
  await z.mutate.table.delete({ a: 2 })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 3,
        "b": "c",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.delete({ a: 3 })

  expect(view.data).toEqual([])
})

it('basics-perf', async () => {
  const { z } = await setupTestEnvironment(simpleSchema)
  const tableQuery = z.query.table

  for (const i in [...Array.from({ length: 3000 }).keys()]) {
    await z.mutate.table.insert({ a: Number(i), b: 'a' })
  }

  const view = tableQuery.materialize(vueViewFactory)

  expect(view.data.length).toBe(3000)
})

it('hydrate-empty', async () => {
  const { z } = await setupTestEnvironment(simpleSchema)
  const tableQuery = z.query.table

  const view = tableQuery.materialize(vueViewFactory)

  expect(view.data).toEqual([])
})

it('tree', async () => {
  const { z } = await setupTestEnvironment(treeSchema)

  await z.mutate.table.insert({ id: 1, name: 'foo', data: null, childID: 2 })
  await z.mutate.table.insert({
    id: 2,
    name: 'foobar',
    data: null,
    childID: null,
  })
  await z.mutate.table.insert({ id: 3, name: 'mon', data: null, childID: 4 })
  await z.mutate.table.insert({
    id: 4,
    name: 'monkey',
    data: null,
    childID: null,
  })

  const query = z.query.table.related('children')
  const view = query.materialize(vueViewFactory)

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.insert({ id: 5, name: 'chocolate', childID: 2 })
  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 5,
        "name": "chocolate",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.delete({ id: 2 })
  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
      {
        "childID": 2,
        "children": [],
        "data": null,
        "id": 5,
        "name": "chocolate",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.insert({
    id: 2,
    name: 'foobaz',
    childID: null,
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobaz",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 2,
        "name": "foobaz",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": null,
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": null,
            "id": 2,
            "name": "foobaz",
            Symbol(rc): 1,
          },
        ],
        "data": null,
        "id": 5,
        "name": "chocolate",
        Symbol(rc): 1,
      },
    ]
  `)
})

it('tree-single', async () => {
  const { z } = await setupTestEnvironment(treeSchema)

  await z.mutate.table.insert({ id: 1, name: 'foo', childID: 2 })
  await z.mutate.table.insert({ id: 2, name: 'foobar', childID: null })

  const query = z.query.table.related('children').one()
  const view = query.materialize(vueViewFactory)

  expect(view.data).toMatchInlineSnapshot(`
    {
      "childID": 2,
      "children": [
        {
          "childID": null,
          "data": null,
          "id": 2,
          "name": "foobar",
          Symbol(rc): 1,
        },
      ],
      "data": null,
      "id": 1,
      "name": "foo",
      Symbol(rc): 1,
    }
  `)

  // remove the child
  await z.mutate.table.delete({ id: 2 })

  expect(view.data).toMatchInlineSnapshot(`
    {
      "childID": 2,
      "children": [],
      "data": null,
      "id": 1,
      "name": "foo",
      Symbol(rc): 1,
    }
  `)

  // remove the parent
  await z.mutate.table.delete({ id: 1 })
  expect(view.data).toEqual(undefined)
})

it('collapse', async () => {
  const { z } = await setupTestEnvironment(collapseSchema)
  const query = z.query.issue.related('labels')
  const view = query.materialize(vueViewFactory)

  expect(view.data).toEqual([])

  const changeSansType = {
    node: {
      row: {
        id: 1,
        name: 'issue',
      },
      relationships: {
        labels: () => [
          {
            row: {
              id: 1,
              issueId: 1,
              labelId: 1,
              extra: 'a',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 1,
                    name: 'label',
                  },
                  relationships: {},
                },
              ],
            },
          },
        ],
      },
    },
  } as const

  view.push({
    type: 'add',
    ...changeSansType,
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)

  view.push({
    type: 'remove',
    ...changeSansType,
  })
  expect(view.data).toEqual([])

  view.push({
    type: 'add',
    ...changeSansType,
  })

  view.push({
    type: 'child',
    node: {
      row: {
        id: 1,
        name: 'issue',
      },
      relationships: {
        labels: () => [
          {
            row: {
              id: 1,
              issueId: 1,
              labelId: 1,
              extra: 'a',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 1,
                    name: 'label',
                  },
                  relationships: {},
                },
              ],
            },
          },
          {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2',
                  },
                  relationships: {},
                },
              ],
            },
          },
        ],
      },
    },
    child: {
      relationshipName: 'labels',
      change: {
        type: 'add',
        node: {
          row: {
            id: 2,
            issueId: 1,
            labelId: 2,
            extra: 'b',
          },
          relationships: {
            labels: () => [
              {
                row: {
                  id: 2,
                  name: 'label2',
                },
                relationships: {},
              },
            ],
          },
        },
      },
    },
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
          {
            "id": 2,
            "name": "label2",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)

  // edit the hidden row
  view.push({
    type: 'child',
    node: {
      row: {
        id: 1,
        name: 'issue',
      },
      relationships: {
        labels: () => [
          {
            row: {
              id: 1,
              issueId: 1,
              labelId: 1,
              extra: 'a',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 1,
                    name: 'label',
                  },
                  relationships: {},
                },
              ],
            },
          },
          {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b2',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2',
                  },
                  relationships: {},
                },
              ],
            },
          },
        ],
      },
    },
    child: {
      relationshipName: 'labels',
      change: {
        type: 'edit',
        oldNode: {
          row: {
            id: 2,
            issueId: 1,
            labelId: 2,
            extra: 'b',
          },
          relationships: {
            labels: () => [
              {
                row: {
                  id: 2,
                  name: 'label2',
                },
                relationships: {},
              },
            ],
          },
        },
        node: {
          row: {
            id: 2,
            issueId: 1,
            labelId: 2,
            extra: 'b2',
          },
          relationships: {
            labels: () => [
              {
                row: {
                  id: 2,
                  name: 'label2',
                },
                relationships: {},
              },
            ],
          },
        },
      },
    },
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
          {
            "id": 2,
            "name": "label2",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)

  // edit the leaf
  view.push({
    type: 'child',
    node: {
      row: {
        id: 1,
        name: 'issue',
      },
      relationships: {
        labels: () => [
          {
            row: {
              id: 1,
              issueId: 1,
              labelId: 1,
              extra: 'a',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 1,
                    name: 'label',
                  },
                  relationships: {},
                },
              ],
            },
          },
          {
            row: {
              id: 2,
              issueId: 1,
              labelId: 2,
              extra: 'b2',
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 2,
                    name: 'label2x',
                  },
                  relationships: {},
                },
              ],
            },
          },
        ],
      },
    },
    child: {
      relationshipName: 'labels',
      change: {
        type: 'child',
        node: {
          row: {
            id: 2,
            issueId: 1,
            labelId: 2,
            extra: 'b2',
          },
          relationships: {
            labels: () => [
              {
                row: {
                  id: 2,
                  name: 'label2x',
                },
                relationships: {},
              },
            ],
          },
        },
        child: {
          relationshipName: 'labels',
          change: {
            type: 'edit',
            oldNode: {
              row: {
                id: 2,
                name: 'label2',
              },
              relationships: {},
            },
            node: {
              row: {
                id: 2,
                name: 'label2x',
              },
              relationships: {},
            },
          },
        },
      },
    },
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
          {
            "id": 2,
            "name": "label2x",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)
})

it('collapse-single', async () => {
  const { z } = await setupTestEnvironment(collapseSchema)
  const query = z.query.issue.related('labels')
  const view = query.materialize(vueViewFactory)

  expect(view.data).toEqual([])

  const changeSansType = {
    node: {
      row: {
        id: 1,
        name: 'issue',
      },
      relationships: {
        labels: () => [
          {
            row: {
              id: 1,
              issueId: 1,
              labelId: 1,
            },
            relationships: {
              labels: () => [
                {
                  row: {
                    id: 1,
                    name: 'label',
                  },
                  relationships: {},
                },
              ],
            },
          },
        ],
      },
    },
  } as const
  view.push({
    type: 'add',
    ...changeSansType,
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "labels": [
          {
            "id": 1,
            "name": "label",
            Symbol(rc): 1,
          },
        ],
        "name": "issue",
        Symbol(rc): 1,
      },
    ]
  `)
})

it('basic with edit pushes', async () => {
  const { z } = await setupTestEnvironment(simpleSchema)
  await z.mutate.table.insert({ a: 1, b: 'a' })
  await z.mutate.table.insert({ a: 2, b: 'b' })

  const query = z.query.table
  const view = query.materialize(vueViewFactory)
  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.update({ a: 2, b: 'b2' })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b2",
        Symbol(rc): 1,
      },
    ]
  `)

  await z.mutate.table.insert({ a: 3, b: 'b3' })
  await z.mutate.table.delete({ a: 2 })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 3,
        "b": "b3",
        Symbol(rc): 1,
      },
    ]
  `)
})

it('tree edit', async () => {
  const { z } = await setupTestEnvironment(treeSchema)

  await z.mutate.table.insert({ id: 1, name: 'foo', data: 'a', childID: 2 })
  await z.mutate.table.insert({
    id: 2,
    name: 'foobar',
    data: 'b',
    childID: null,
  })
  await z.mutate.table.insert({ id: 3, name: 'mon', data: 'c', childID: 4 })
  await z.mutate.table.insert({
    id: 4,
    name: 'monkey',
    data: 'd',
    childID: null,
  })

  const query = z.query.table.related('children')
  const view = query.materialize(vueViewFactory)

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": "b",
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": "a",
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "b",
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": "d",
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": "c",
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "d",
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)

  // Edit root
  await z.mutate.table.update({ id: 1, data: 'a2' })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": "b",
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": "a2",
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "b",
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": "d",
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": "c",
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "d",
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)

  // Edit leaf
  await z.mutate.table.update({ id: 4, data: 'd2' })
  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "childID": 2,
        "children": [
          {
            "childID": null,
            "data": "b",
            "id": 2,
            "name": "foobar",
            Symbol(rc): 1,
          },
        ],
        "data": "a2",
        "id": 1,
        "name": "foo",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "b",
        "id": 2,
        "name": "foobar",
        Symbol(rc): 1,
      },
      {
        "childID": 4,
        "children": [
          {
            "childID": null,
            "data": "d2",
            "id": 4,
            "name": "monkey",
            Symbol(rc): 1,
          },
        ],
        "data": "c",
        "id": 3,
        "name": "mon",
        Symbol(rc): 1,
      },
      {
        "childID": null,
        "children": [],
        "data": "d2",
        "id": 4,
        "name": "monkey",
        Symbol(rc): 1,
      },
    ]
  `)
})

it('queryComplete promise', async () => {
  const { z } = await setupTestEnvironment(simpleSchema)
  await z.mutate.table.insert({ a: 1, b: 'a' })
  await z.mutate.table.insert({ a: 2, b: 'b' })

  const queryCompleteResolver = resolver<true>()

  const onTransactionCommit = () => {}

  const query = z.query.table
  const view = query.materialize((_, input) => {
    return new VueView(
      input,
      onTransactionCommit,
      { singular: false, relationships: {} },
      () => {},
      queryCompleteResolver.promise,
    )
  })

  expect(view.data).toMatchInlineSnapshot(`
    [
      {
        "a": 1,
        "b": "a",
        Symbol(rc): 1,
      },
      {
        "a": 2,
        "b": "b",
        Symbol(rc): 1,
      },
    ]
  `)
  expect(view.status).toEqual('unknown')

  queryCompleteResolver.resolve(true)
  await 1
  expect(view.status).toEqual('complete')
})

interface TestReturn {
  a: number
  b: string
}

it('factory', async () => {
  const { z } = await setupTestEnvironment(simpleSchema)
  await z.mutate.table.insert({ a: 1, b: 'a' })
  await z.mutate.table.insert({ a: 2, b: 'b' })

  const onDestroy = vi.fn()
  const onTransactionCommit = vi.fn()

  const query = z.query.table
  const view = query.materialize((_, input) => {
    return vueViewFactory(
      undefined as unknown as Query<typeof simpleSchema, 'table', TestReturn>,
      input,
      { singular: false, relationships: {} },
      onDestroy,
      onTransactionCommit,
      true,
    )
  })

  expect(view).toBeDefined()
  expect(onTransactionCommit).not.toHaveBeenCalled()
  expect(onDestroy).not.toHaveBeenCalled()
  view.destroy()
  expect(onDestroy).toHaveBeenCalledTimes(1)
})
