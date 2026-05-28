const prisma = require('../config/prisma');
const { notifyLoanOverdue } = require('./mailNotify');

async function markOverdueLoans() {
  const result = await prisma.loan.updateMany({
    where: {
      dueDate: { lt: new Date() },
      returnDate: null,
      status: 'ACTIVE'
    },
    data: { status: 'OVERDUE' }
  });

  if (result.count > 0) {
    const overdueLoans = await prisma.loan.findMany({
      where: {
        dueDate: { lt: new Date() },
        returnDate: null,
        status: 'OVERDUE'
      },
      include: { device: true, user: true }
    });

    for (const loan of overdueLoans) {
      process.nextTick(() => notifyLoanOverdue(loan).catch(() => {}));
    }
  }

  return result;
}

module.exports = { markOverdueLoans };
