  - https://medium.com/@ehuerikenbaba/react-fundamentals-building-your-first-app-with-vite-1925d7a4204c
  - https://medium.com/@smita.s.kothari/angular-tutorial-learn-angular-by-building-an-app-from-scratch-533ba75b368b
  - https://medium.com/@demian.kostelny/fastify-quick-guide-for-beginners-8534a107cc18
  - https://medium.com/@chiragmehta900/build-your-first-next-js-app-from-scratch-to-learn-next-js-df7512db1903
  - https://medium.com/@douglas.rochedo/how-to-make-a-simple-server-in-express-js-4ae143cf95e5
  - https://medium.com/@skhans/building-web-applications-with-express-js-a-comprehensive-guide-113a77be1b11

---

Known infrastructure limitations (not addressed)
- Angular CLI (ng new, ng serve, ng generate): Blocked by a loader ESM interop bug — yargs@18 ships ESM .mjs files that the CJS wrapper can't parse. The test uses Vite+AnalogJS instead, which is a real-world Angular development setup.
- create-next-app: Scaffolds correctly but internal npm install fails due to child process shim limitation. tutorial.feature remains unwired until that's fixed.
