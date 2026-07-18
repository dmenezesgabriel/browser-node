import { useState } from 'react'
import { createTodo, toggleTodo, deleteTodo } from './todos'

export default function App() {
  const [todos, setTodos] = useState([])
  const [input, setInput] = useState('')

  function handleAdd() {
    if (!input.trim()) return
    setTodos([...todos, createTodo(input)])
    setInput('')
  }

  function handleToggle(todo) {
    setTodos(todos.map(function (t) { return t.id === todo.id ? toggleTodo(t) : t }))
  }

  function handleDelete(id) {
    setTodos(deleteTodo(todos, id))
  }

  return (
    <div>
      <h1>React Todos</h1>
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
    </div>
  )
}
