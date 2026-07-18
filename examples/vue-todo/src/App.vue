<template>
  <div>
    <h1>Vue Todos</h1>
    <div class="input-row">
      <input v-model="inputText" @keyup.enter="handleAdd" placeholder="What needs to be done?">
      <button class="add-btn" @click="handleAdd">Add</button>
    </div>
    <p v-if="todos.length === 0" class="empty">No todos yet. Add one above!</p>
    <ul v-else class="todo-list">
      <li v-for="todo in todos" :key="todo.id" class="todo-item">
        <input type="checkbox" :checked="todo.completed" @change="handleToggle(todo)">
        <span :class="['todo-text', { done: todo.completed }]" @click="handleToggle(todo)">{{ todo.text }}</span>
        <button class="del-btn" @click="handleDelete(todo.id)">×</button>
      </li>
    </ul>
  </div>
</template>

<script>
import { createTodo, toggleTodo, deleteTodo } from './todos'

export default {
  data() {
    return {
      todos: [],
      inputText: ''
    }
  },
  methods: {
    handleAdd() {
      if (!this.inputText.trim()) return
      this.todos.push(createTodo(this.inputText))
      this.inputText = ''
    },
    handleToggle(todo) {
      const idx = this.todos.findIndex(function (t) { return t.id === todo.id })
      if (idx !== -1) this.todos[idx] = toggleTodo(todo)
    },
    handleDelete(id) {
      this.todos = deleteTodo(this.todos, id)
    }
  }
}
</script>
