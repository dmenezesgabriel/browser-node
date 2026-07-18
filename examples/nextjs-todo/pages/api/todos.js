import { createTodo } from '../../lib/todos'

let todos = []

export default function handler(req, res) {
  const { method, query, body } = req

  if (method === 'GET') {
    return res.status(200).json(todos)
  }

  if (method === 'POST') {
    const { text } = body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' })
    }
    const todo = createTodo(text)
    todos.push(todo)
    return res.status(201).json(todo)
  }

  if (method === 'PATCH') {
    const id = Number(query.id)
    const todo = todos.find(function (t) { return t.id === id })
    if (!todo) return res.status(404).json({ error: 'todo not found' })
    if (typeof body.text === 'string') todo.text = body.text
    if (typeof body.completed === 'boolean') todo.completed = body.completed
    return res.status(200).json(todo)
  }

  if (method === 'DELETE') {
    const id = Number(query.id)
    const idx = todos.findIndex(function (t) { return t.id === id })
    if (idx === -1) return res.status(404).json({ error: 'todo not found' })
    todos.splice(idx, 1)
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'method not allowed' })
}
