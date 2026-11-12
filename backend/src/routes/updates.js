const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../services/permissions');
const { nextId } = require('../services/ids');

const router = express.Router();

// List all device updates
router.get('/', auth, requirePermission('UPDATE_VIEW'), async (req, res, next) => {
  try {
    const updates = await prisma.deviceUpdate.findMany({
      include: {
        rooms: {
          select: {
            id: true,
            name: true
          }
        },
        results: {
          select: {
            status: true
          }
        }
      },
      orderBy: {
        dateTime: 'desc'
      }
    });

    // Add aggregate counts
    const mappedUpdates = updates.map(update => {
      const total = update.results.length;
      const success = update.results.filter(r => r.status === 'SUCCESS').length;
      const failed = update.results.filter(r => r.status === 'FAILED').length;
      return {
        ...update,
        results: undefined, // don't send all results in list view
        counts: { total, success, failed }
      };
    });

    res.json(mappedUpdates);
  } catch (error) {
    next(error);
  }
});

// Create a new device update
router.post('/', auth, requirePermission('UPDATE_MANAGE'), async (req, res, next) => {
  try {
    const { dateTime, location, roomIds = [], deviceIds = [] } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Ort des Updates ist erforderlich.', code: 'LOCATION_REQUIRED' });
    }

    let targetDevices = [];

    if (deviceIds.length > 0) {
      // Direct selection of devices
      targetDevices = await prisma.device.findMany({
        where: {
          id: { in: deviceIds }
        }
      });
    } else if (roomIds.length > 0) {
      // Find devices in specified rooms that have updates enabled
      targetDevices = await prisma.device.findMany({
        where: {
          roomId: { in: roomIds },
          updatesEnabled: true
        }
      });
    } else {
      // Default: Find all devices globally that have updates enabled
      targetDevices = await prisma.device.findMany({
        where: {
          updatesEnabled: true
        }
      });
    }

    if (targetDevices.length === 0) {
      return res.status(400).json({
        error: 'Keine passenden Geräte für das Update gefunden.',
        code: 'NO_DEVICES_FOUND'
      });
    }

    const updateDate = dateTime ? new Date(dateTime) : new Date();

    // Create DeviceUpdate record with results
    const updateRun = await prisma.deviceUpdate.create({
      data: {
        id: await nextId('update'),
        dateTime: updateDate,
        location,
        rooms: {
          connect: roomIds.map(id => ({ id }))
        },
        results: {
          create: targetDevices.map(device => ({
            deviceId: device.id,
            status: 'SUCCESS' // Default is successful
          }))
        }
      },
      include: {
        results: true
      }
    });

    // Log history for each device
    await Promise.all(
      targetDevices.map(device =>
        prisma.deviceHistory.create({
          data: {
            deviceId: device.id,
            action: 'UPDATE_START',
            details: `Update-Lauf gestartet (Ort: ${location}). Standard-Status: Erfolgreich.`,
            userId: req.user.id
          }
        })
      )
    );

    res.status(201).json(updateRun);
  } catch (error) {
    next(error);
  }
});

// Fetch detailed information of a single update run
router.get('/:id', auth, requirePermission('UPDATE_VIEW'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateRun = await prisma.deviceUpdate.findUnique({
      where: { id },
      include: {
        rooms: {
          select: {
            id: true,
            name: true
          }
        },
        results: {
          include: {
            device: {
              select: {
                id: true,
                inventoryId: true,
                manufacturer: true,
                model: true,
                room: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!updateRun) {
      return res.status(404).json({ error: 'Update-Lauf nicht gefunden.', code: 'UPDATE_NOT_FOUND' });
    }

    res.json(updateRun);
  } catch (error) {
    next(error);
  }
});

// Update result status/details for a single device in an update run
router.put('/:updateId/results/:resultId', auth, requirePermission('UPDATE_MANAGE'), async (req, res, next) => {
  try {
    const { updateId, resultId } = req.params;
    const { status, errorDetails } = req.body;

    if (!['SUCCESS', 'FAILED'].includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status. Erlaubt sind SUCCESS oder FAILED.', code: 'INVALID_STATUS' });
    }

    // Find result record
    const result = await prisma.deviceUpdateResult.findUnique({
      where: { id: resultId },
      include: {
        update: true,
        device: true
      }
    });

    if (!result || result.updateId !== updateId) {
      return res.status(404).json({ error: 'Ergebnisdatensatz nicht gefunden.', code: 'RESULT_NOT_FOUND' });
    }

    // Update result status
    const updatedResult = await prisma.deviceUpdateResult.update({
      where: { id: resultId },
      data: {
        status,
        errorDetails: status === 'FAILED' ? errorDetails : null
      }
    });

    // Audit log in DeviceHistory
    const statusText = status === 'SUCCESS' ? 'erfolgreich' : 'fehlgeschlagen';
    const logDetails = status === 'FAILED' ? `Fehlerursache: ${errorDetails || 'Keine Angabe'}` : 'Update erfolgreich abgeschlossen.';
    
    await prisma.deviceHistory.create({
      data: {
        deviceId: result.deviceId,
        action: status === 'SUCCESS' ? 'UPDATE_SUCCESS' : 'UPDATE_FAILED',
        details: `Update-Status geändert auf ${statusText}. ${logDetails}`,
        userId: req.user.id
      }
    });

    res.json(updatedResult);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
