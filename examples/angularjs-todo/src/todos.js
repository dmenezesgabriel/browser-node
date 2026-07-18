let nextId = 1

export function createTodo(text) {
  return { id: nextId++, text, completed: false }
}

export function toggleTodo(todo) {
  return { ...todo, completed: !todo.completed }
}

export function deleteTodo(todos, id) {
  return todos.filter(function (t) { return t.id !== id })
}

export function resetIdCounter() {
  nextId = 1
}
