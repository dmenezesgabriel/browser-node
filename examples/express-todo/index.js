'use strict'
const express = require('express')
const app = express()

app.use(express.json())
app.use(express.static('public'))

let todos = []
let nextId = 1

app.get('/api/todos', function (req, res) {
  res.json(todos)
})

app.post('/api/todos', function (req, res) {
  const { text } = req.body
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' })
  }
  const todo = { id: nextId++, text, completed: false }
  todos.push(todo)
  res.status(201).json(todo)
})

app.patch('/api/todos/:id', function (req, res) {
  const id = Number(req.params.id)
  const todo = todos.find(function (t) { return t.id === id })
  if (!todo) return res.status(404).json({ error: 'todo not found' })
  if (typeof req.body.text === 'string') todo.text = req.body.text
  if (typeof req.body.completed === 'boolean') todo.completed = req.body.completed
  res.json(todo)
})

app.delete('/api/todos/:id', function (req, res) {
  const id = Number(req.params.id)
  const idx = todos.findIndex(function (t) { return t.id === id })
  if (idx === -1) return res.status(404).json({ error: 'todo not found' })
  todos.splice(idx, 1)
  res.status(204).end()
})

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000
  app.listen(PORT, function () {
    console.log('Express Todo server on http://localhost:' + PORT)
  })
}

module.exports = { app, reset: function () { todos = []; nextId = 1 } }
