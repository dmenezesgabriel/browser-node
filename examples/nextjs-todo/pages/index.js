import { useState, useEffect } from 'react'
import { createTodo, toggleTodo, deleteTodo } from '../lib/todos'

const API = '/api/todos'

export default function Home() {
  const [todos, setTodos] = useState([])
  const [input, setInput] = useState('')

  async function fetchTodos() {
    const res = await fetch(API)
    setTodos(await res.json())
  }

  useEffect(function () { fetchTodos() }, [])

  async function handleAdd() {
    if (!input.trim()) return
    await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: input }) })
    setInput('')
    fetchTodos()
  }

  async function handleToggle(todo) {
    await fetch(API + '?id=' + todo.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !todo.completed }) })
    fetchTodos()
  }

  async function handleDelete(id) {
    await fetch(API + '?id=' + id, { method: 'DELETE' })
    fetchTodos()
  }

  return (
    <div>
      <h1>Next.js Todos</h1>
      <div className="input-row">
        <input value={input} onChange={function (e) { return setInput(e.target.value) }} onKeyDown={function (e) { if (e.key === 'Enter') handleAdd() }} placeholder="What needs to be done?" />
        <button className="add-btn" onClick={handleAdd}>Add</button>
      </div>
      {todos.length === 0 ? (
        <p className="empty">No todos yet. Add one above!</p>
      ) : (
        <ul className="todo-list">
          {todos.map(function (todo) {
            return (
              <li key={todo.id} className="todo-item">
                <input type="checkbox" checked={todo.completed} onChange={function () { return handleToggle(todo) }} />
                <span className={'todo-text' + (todo.completed ? ' done' : '')} onClick={function () { return handleToggle(todo) }}>{todo.text}</span>
                <button className="del-btn" onClick={function () { return handleDelete(todo.id) }}>{'\u00d7'}</button>
              </li>
            )
          })}
        </ul>
      )}
      <style jsx>{`
        h1 { color: #000; text-align: center; }
        .input-row { display: flex; gap: 8px; margin-bottom: 1.5rem; }
        input { flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
        .add-btn { background: #0070f3; color: #fff; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; }
        .todo-list { list-style: none; padding: 0; }
        .todo-item { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #eee; }
        .todo-text { flex: 1; cursor: pointer; }
        .todo-text.done { text-decoration: line-through; color: #999; }
        .del-btn { background: transparent; color: #f00; border: none; cursor: pointer; }
        .empty { text-align: center; color: #999; padding: 2rem; }
      `}</style>
    </div>
  )
}
