const prisma = require('../config/prisma');
const { notifyLoanOverdue, notifyLoanDueSoon } = require('./mailNotify');

async function markOverdueLoans() {
  const now = new Date();
  const overdueLoans = await prisma.loan.findMany({
    where: {
      dueDate: { lt: now },
      returnDate: null,
      status: 'ACTIVE',
      archivedAt: null
    },
    include: { device: true, user: true }
  });

  if (overdueLoans.length > 0) {
    await prisma.loan.updateMany({
      where: { id: { in: overdueLoans.map((loan) => loan.id) } },
      data: { status: 'OVERDUE' }
    });

    await Promise.allSettled(overdueLoans.map((loan) => notifyLoanOverdue(loan)));
  }

  return { count: overdueLoans.length };
}

async function notifyUpcomingDueLoans() {
  return notifyLoanDueSoon();
}

module.exports = { markOverdueLoans, notifyUpcomingDueLoans };
