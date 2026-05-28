const crypto = require('crypto');
const express = require('express');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth, requireRole('ADMIN'));

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

router.get('/', async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ apiKeys: keys });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const plainKey = `mzi_${crypto.randomBytes(32).toString('hex')}`;
    const apiKey = await prisma.apiKey.create({
      data: { name: req.body.name || 'Monitoring Agent', keyHash: hashKey(plainKey) }
    });
    res.status(201).json({ apiKey, key: plainKey });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.apiKey.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
