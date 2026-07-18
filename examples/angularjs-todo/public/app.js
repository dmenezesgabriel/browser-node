var app = angular.module('todoApp', [])

var nextId = 1

app.controller('TodoController', function ($scope) {
  $scope.todos = []
  $scope.inputText = ''

  $scope.addTodo = function () {
    var text = $scope.inputText
    if (!text || !text.trim()) return
    $scope.todos.push({ id: nextId++, text: text, completed: false })
    $scope.inputText = ''
  }

  $scope.toggleTodo = function (todo) {
    todo.completed = !todo.completed
  }

  $scope.deleteTodo = function (id) {
    var idx = $scope.todos.findIndex(function (t) { return t.id === id })
    if (idx !== -1) $scope.todos.splice(idx, 1)
  }
})
