const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { conditionSummary, OPEN_ISSUE_STATUSES } = require('../services/deviceCondition');
const { hasPermission } = require('../services/permissions');

const router = express.Router();

const OPEN_ISSUE_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  createdAt: true
};

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/my-devices
 * Die Geräte, die dem angemeldeten Benutzer aktuell zugewiesen sind
 * (aktive bzw. überfällige Ausleihe). Enthält pro Gerät die offenen Tickets
 * und die daraus berechnete Zustandsursache („Gerät ist defekt/eingeschränkt"
 * mit konkretem Grund), damit „Mein Gerät" nie nur einen reinen Status zeigt.
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        userId: req.user.id,
        status: { in: ['ACTIVE', 'OVERDUE'] },
        archivedAt: null
      },
      orderBy: { dueDate: 'asc' },
      include: {
        device: {
          include: {
            room: true,
            area: {
              include: {
                room: true,
                // Zuständige Bearbeiter des Bereichs – Fallback, wenn kein
                // einzelner Administrator am Gerät hinterlegt ist.
                editors: { select: { user: { select: { id: true, username: true, displayName: true, role: true } } } }
              }
            },
            admin: { select: { id: true, username: true, displayName: true, role: true } },
            issues: {
              where: { status: { in: OPEN_ISSUE_STATUSES } },
              select: OPEN_ISSUE_SELECT,
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    const devices = loans
      .filter((loan) => loan.device)
      .map((loan) => {
        const device = loan.device;
        const openIssues = device.issues || [];
        const { issues, ...deviceFields } = device;
        const areaEditors = (device.area?.editors || []).map((editor) => editor.user).filter(Boolean);

        return {
          loan: {
            id: loan.id,
            status: loan.status,
            startDate: loan.startDate,
            dueDate: loan.dueDate,
            returnDate: loan.returnDate,
            requestReason: loan.requestReason
          },
          area: device.area || null,
          admin: device.admin || null,
          // Verantwortliche Personen: explizit hinterlegter Administrator,
          // anderenfalls die Bearbeiter des übergeordneten Bereichs.
          admins: device.admin ? [device.admin] : areaEditors,
          openIssues,
          condition: conditionSummary(device, openIssues),
          // Die Detailseite darf nur geöffnet werden, wenn das Recht dafür
          // vorhanden ist – die Sichtbarkeit des Geräts greift hier ohnehin
          // nicht (eigene aktive Ausleihe).
          canOpenDetail: hasPermission(req.user, 'DEVICE_VIEW'),
          device: {
            ...deviceFields,
            labels: parseJsonArray(device.labels),
            images: parseJsonArray(device.images)
          }
        };
      });

    res.json({ devices });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
