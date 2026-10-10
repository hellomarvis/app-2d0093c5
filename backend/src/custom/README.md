# backend/src/custom

Place hand-written route extensions here. Files in this directory are never
touched by the CRUD compiler.

Example: override the generated posts list with a search endpoint.

```ts
// src/custom/postSearch.ts
import { Router } from 'express';
import middleware from '../middleware';
import { prisma } from '../lib/prisma';

const router = Router();
router.get('/search', middleware.jwtCheck, async (req, res) => {
  const q = String(req.query.q ?? '');
  const results = await prisma.post.findMany({
    where: { title: { contains: q, mode: 'insensitive' }, tenantId: req.user!.tenantId },
  });
  res.json(results);
});
export default router;
```

Then mount it in `src/index.ts`:
```ts
import postSearchRouter from './custom/postSearch';
app.use('/api/posts', postSearchRouter);
```
