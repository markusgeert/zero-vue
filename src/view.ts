// based on https://github.com/rocicorp/mono/tree/main/packages/zero-solid

import type { ResultType, Schema } from '@rocicorp/zero'
import type { Change, Entry, Format, HumanReadable, Input, Output, Query, ViewFactory } from '@rocicorp/zero/advanced'
import { applyChange } from '@rocicorp/zero/advanced'
import { reactive, toRaw } from 'vue'

interface QueryResultDetails {
  readonly type: ResultType
}

type State = [Entry, QueryResultDetails]

const complete = { type: 'complete' } as const
const unknown = { type: 'unknown' } as const

interface RefCountMap {
  get: (entry: Entry) => number | undefined
  set: (entry: Entry, refCount: number) => void
  delete: (entry: Entry) => boolean
}

class VueRefCountMap implements RefCountMap {
  readonly #map = new WeakMap<Entry, number>()

  get(entry: Entry) {
    return this.#map.get(toRaw(entry))
  }

  set(entry: Entry, refCount: number) {
    this.#map.set(toRaw(entry), refCount)
  }

  delete(entry: Entry) {
    return this.#map.delete(toRaw(entry))
  }
}

class VueView<V> implements Output {
  readonly #input: Input
  readonly #format: Format
  readonly #onDestroy: () => void
  readonly #refCountMap = new VueRefCountMap()

  #state: State

  constructor(
    input: Input,
    onTransactionCommit: (cb: () => void) => void,
    format: Format = { singular: false, relationships: {} },
    onDestroy: () => void = () => {},
    queryComplete: true | Promise<true>,
  ) {
    this.#input = input
    this.#format = format
    this.#onDestroy = onDestroy
    this.#state = reactive([
      { '': format.singular ? undefined : [] },
      queryComplete === true ? complete : unknown,
    ])
    input.setOutput(this)

    for (const node of input.fetch({})) {
      this.#applyChange({ type: 'add', node })
    }

    if (queryComplete !== true) {
      void queryComplete.then(() => {
        this.#state[1] = complete
      })
    }
  }

  get data() {
    return this.#state[0][''] as V
  }

  get status() {
    return this.#state[1].type
  }

  destroy() {
    this.#onDestroy()
  }

  #applyChange(change: Change): void {
    applyChange(
      this.#state[0],
      change,
      this.#input.getSchema(),
      '',
      this.#format,
      this.#refCountMap,
    )
  }

  push(change: Change): void {
    this.#applyChange(change)
  }
}

export function vueViewFactory<
  TSchema extends Schema,
  TTable extends keyof TSchema['tables'] & string,
  TReturn,
>(
  _query: Query<TSchema, TTable, TReturn>,
  input: Input,
  format: Format,
  onDestroy: () => void,
  onTransactionCommit: (cb: () => void) => void,
  queryComplete: true | Promise<true>,
) {
  return new VueView<HumanReadable<TReturn>>(
    input,
    onTransactionCommit,
    format,
    onDestroy,
    queryComplete,
  )
}

vueViewFactory satisfies ViewFactory<Schema, string, unknown, unknown>
