import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, toggleTodo, deleteTodo, resetIdCounter } from '../src/todos'

beforeEach(function () {
  resetIdCounter()
})

describe('Todo logic', function () {
  it('createTodo creates an uncompleted todo', function () {
    const todo = createTodo('Buy milk')
    expect(todo.text).toBe('Buy milk')
    expect(todo.completed).toBe(false)
    expect(typeof todo.id).toBe('number')
  })

  it('createTodo increments id each call', function () {
    const a = createTodo('A')
    const b = createTodo('B')
    expect(b.id).toBe(a.id + 1)
  })

  it('toggleTodo flips completed', function () {
    const todo = createTodo('Test')
    const toggled = toggleTodo(todo)
    expect(toggled.completed).toBe(true)
  })

  it('toggleTodo does not mutate original', function () {
    const todo = createTodo('Test')
    toggleTodo(todo)
    expect(todo.completed).toBe(false)
  })

  it('deleteTodo removes by id', function () {
    const a = createTodo('A')
    const b = createTodo('B')
    const c = createTodo('C')
    const result = deleteTodo([a, b, c], b.id)
    expect(result).toHaveLength(2)
    expect(result.map(function (t) { return t.id })).toEqual([a.id, c.id])
  })

  it('deleteTodo with non-existent id returns same array', function () {
    const todo = createTodo('A')
    const result = deleteTodo([todo], 999)
    expect(result).toHaveLength(1)
  })
})
