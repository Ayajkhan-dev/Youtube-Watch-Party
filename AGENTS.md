# Rules for AI coding assistant

- Pehle docs/SPEC.md padho. Event naam, roles aur permission matrix badalna mat.
- TypeScript strict; `any` nahi. Roles/event naam sirf @watchparty/shared se.
- Har socket event: zod se payload validate, phir PermissionService se permission check, phir state change.
- userId aur roomId payload se mat lo; JWT / socket.data se lo.
- Permission logic sirf PermissionService mein. Frontend disable sirf UX hai.
- Koi bhi room data global variable mein nahi; RoomStore interface se.
- YouTube: onStateChange se server ko kabhi emit nahi karna (echo loop).
- Secrets (JWT_SECRET, MONGO_URI, REDIS_URL) code/git mein nahi.
- Har file ke upar 2-line comment (simple Hinglish): ye kya karti hai.
- Ek phase = ek kaam. Tests likho, phir explain karo (line-by-line, simple Hinglish).
