Feature: Angular Tutorial workflow
  As a developer
  I want to build an Angular app from scratch
  To verify the browser-node environment can handle Angular development workflows

  Background:
    Given the browser-node environment is ready

  Scenario: Create and serve an Angular app from scratch
    When I run terminal command "mkdir -p /app/angular-todo/src/app" with timeout 10s
    When I create file "/app/angular-todo/package.json" with content "{\"name\":\"angular-todo\",\"private\":true,\"type\":\"module\",\"scripts\":{\"dev\":\"vite --port 4200\",\"build\":\"vite build\",\"preview\":\"vite preview\"},\"dependencies\":{\"@angular/core\":\"^19.0.0\",\"@angular/common\":\"^19.0.0\",\"@angular/compiler\":\"^19.0.0\",\"@angular/platform-browser\":\"^19.0.0\",\"@angular/platform-browser-dynamic\":\"^19.0.0\",\"@angular/forms\":\"^19.0.0\",\"rxjs\":\"^7.8.0\",\"zone.js\":\"~0.14.0\"},\"devDependencies\":{\"vite\":\"^8.0.16\",\"typescript\":\"5.5.4\",\"@angular/build\":\"^19.0.0\",\"@angular/compiler-cli\":\"^19.0.0\",\"@analogjs/vite-plugin-angular\":\"^2.6.0\"}}"
    When I create file "/app/angular-todo/tsconfig.json" with content "{\"compilerOptions\":{\"experimentalDecorators\":true,\"emitDecoratorMetadata\":true,\"target\":\"ES2022\",\"module\":\"ESNext\",\"moduleResolution\":\"bundler\",\"esModuleInterop\":true,\"skipLibCheck\":true},\"angularCompilerOptions\":{\"enableI18nLegacyMessageIdFormat\":false}}"
    When I create file "/app/angular-todo/tsconfig.app.json" with content "{\"extends\":\"./tsconfig.json\",\"compilerOptions\":{},\"include\":[\"src/**/*.ts\"]}"
    When I create file "/app/angular-todo/vite.config.ts" with content "import { defineConfig } from 'vite'\nimport angular from '@analogjs/vite-plugin-angular'\nexport default defineConfig({server:{port:4200,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},plugins:[angular({tsconfig:'/app/angular-todo/tsconfig.app.json'})]})"
    When I create file "/app/angular-todo/index.html" with content "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" /><title>Angular Todo</title></head><body><app-root>Loading Angular application...</app-root><script type=\"module\" src=\"/src/main.ts\"></script></body></html>"
    When I create file "/app/angular-todo/src/main.ts" with content "import 'zone.js'\nimport { bootstrapApplication } from '@angular/platform-browser'\nimport { AppComponent } from './app/app.component'\nimport { provideProtractorTestingSupport } from '@angular/platform-browser'\nbootstrapApplication(AppComponent).catch(err => console.error(err))"
    When I create file "/app/angular-todo/src/app/app.component.ts" with content "import { Component } from '@angular/core'\nimport { CommonModule } from '@angular/common'\nimport { FormsModule } from '@angular/forms'\n\n@Component({\nselector: 'app-root',\nstandalone: true,\nimports: [CommonModule, FormsModule],\ntemplate: '<h1>Task List</h1><input [(ngModel)]=\"newTask\" placeholder=\"New task\"><button (click)=\"addTask()\">Add</button><ul><li *ngFor=\"let t of tasks; let i = index\">{{t}} <button (click)=\"deleteTask(i)\">x</button></li></ul>',\nstyles: ['h1 { color: #1976d2 } li { margin: 4px 0 } button { margin-left: 8px }']\n})\nexport class AppComponent {\ntasks = ['Learn Angular', 'Build an app', 'Deploy']\nnewTask = ''\naddTask() { if (this.newTask.trim()) { this.tasks.push(this.newTask.trim()); this.newTask = '' } }\ndeleteTask(i: number) { this.tasks.splice(i, 1) }\n}"
    When I run terminal command "cd /app/angular-todo && npm install" with timeout 300s
    Then the terminal should contain "done"
    When I start a server with command "cd /app/angular-todo && npm run dev" until I see "running on"
    Then the terminal should contain "running on"
