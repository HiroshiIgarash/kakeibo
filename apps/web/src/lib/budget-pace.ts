import { jstDateParts, jstDaysInMonth } from "./dates";

export type PaceStatus = "GREEN" | "YELLOW" | "RED";

export type BudgetPace = {
  paceRate: number;
  paceStatus: PaceStatus;
  remainingAmount: number;
  dailyAmount: number;
  idealRate: number;
  actualRate: number;
};

const GREEN_THRESHOLD = 1.0;
const YELLOW_THRESHOLD = 1.2;

/**
 * 予算消化ペースを計算する（純粋関数）。
 * budget の存在確認・spent の集計は呼び出し側の責務。
 */
export function calcBudgetPace(input: {
  budgetAmount: number;
  spentAmount: number;
  date: Date;
}): BudgetPace {
  const { budgetAmount, spentAmount, date } = input;
  const { year, month, day } = jstDateParts(date);

  const daysInMonth = jstDaysInMonth(year, month);
  const daysElapsed = day;
  const remainingDays = daysInMonth - daysElapsed + 1; // 当日を含む残り日数

  const idealRate = daysElapsed / daysInMonth;
  const actualRate = spentAmount / budgetAmount;
  const paceRate = idealRate === 0 ? 0 : actualRate / idealRate;

  let paceStatus: PaceStatus;
  if (actualRate >= 1.0) {
    paceStatus = "RED"; // 予算そのものを使い切っている
  } else if (paceRate >= YELLOW_THRESHOLD) {
    paceStatus = "RED";
  } else if (paceRate >= GREEN_THRESHOLD) {
    paceStatus = "YELLOW";
  } else {
    paceStatus = "GREEN";
  }

  const remainingAmount = budgetAmount - spentAmount;
  // Ruby の整数除算は floor（負値も -infinity 方向）。Math.trunc は使わない。
  const dailyAmount = remainingDays <= 0 ? 0 : Math.floor(remainingAmount / remainingDays);

  return { paceRate, paceStatus, remainingAmount, dailyAmount, idealRate, actualRate };
}
