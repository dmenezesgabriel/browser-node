import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import { server, reset } from './index.js'

const PORT = 3099

function request(method, path, body) {
  return new Promise(function (resolve, reject) {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {}
    }
    if (body) options.headers['Content-Type'] = 'application/json'
    const req = http.request(options, function (res) {
      let data = ''
      res.on('data', function (chunk) { data += chunk })
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null
        })
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

beforeAll(function () {
  return new Promise(function (resolve) {
    server.listen(PORT, resolve)
  })
})

afterAll(function () {
  server.close()
})

beforeEach(function () {
  reset()
})

describe('Node HTTP Todo API', function () {
  it('GET /api/todos returns empty array', async function () {
    const res = await request('GET', '/api/todos')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('POST /api/todos creates a todo', async function () {
    const res = await request('POST', '/api/todos', { text: 'Buy milk' })
    expect(res.status).toBe(201)
    expect(res.body.text).toBe('Buy milk')
    expect(res.body.completed).toBe(false)
    expect(typeof res.body.id).toBe('number')
  })

  it('POST /api/todos without text returns 400', async function () {
    const res = await request('POST', '/api/todos', {})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('text is required')
  })

  it('PATCH /api/todos/:id updates a todo', async function () {
    const created = await request('POST', '/api/todos', { text: 'Buy milk' })
    const res = await request('PATCH', '/api/todos/' + created.body.id, { completed: true })
    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(true)
  })

  it('DELETE /api/todos/:id removes a todo', async function () {
    const created = await request('POST', '/api/todos', { text: 'Buy milk' })
    const res = await request('DELETE', '/api/todos/' + created.body.id)
    expect(res.status).toBe(204)
    const list = await request('GET', '/api/todos')
    expect(list.body).toEqual([])
  })

  it('DELETE /api/todos/:id with invalid id returns 404', async function () {
    const res = await request('DELETE', '/api/todos/999')
    expect(res.status).toBe(404)
  })
})
