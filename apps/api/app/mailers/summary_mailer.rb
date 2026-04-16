class SummaryMailer < ApplicationMailer
  def monthly_summary(target_month:)
    @target_month = target_month

    @category_totals = category_totals_for(target_month)
    @total_spent = @category_totals.values.sum
    @recommended_budgets = recommended_budgets_for(@category_totals.keys, target_month)

    mail(
      to: ENV["ALERT_EMAIL"],
      subject: "【月次レポート】#{target_month.year}年#{target_month.month}月の家計まとめ"
    )
  end

  private

  def category_totals_for(month)
    sums = Transaction
      .where(purchased_at: month.beginning_of_month..month.end_of_month)
      .where.not(category_id: nil)
      .group(:category_id)
      .sum(:amount)

    categories = Category.where(id: sums.keys).index_by(&:id)
    sums.transform_keys { |id| categories[id] }
  end

  def recommended_budgets_for(categories, target_month)
    start_date = (target_month - 2.months).beginning_of_month
    end_date = target_month.end_of_month

    # カテゴリ×3ヶ月分を1クエリで取得
    raw_sums = Transaction
      .where(category: categories, purchased_at: start_date..end_date)
      .group(:category_id, Arel.sql("date_trunc('month', purchased_at)"))
      .sum(:amount)

    sums_index = raw_sums.each_with_object({}) do |(key, amount), h|
      cat_id, month_time = key
      h[[cat_id, month_time.to_date.beginning_of_month]] = amount
    end

    categories.each_with_object({}) do |category, hash|
      monthly_totals = (0..2).map do |n|
        month = (target_month - n.months).beginning_of_month
        sums_index[[category.id, month]] || 0
      end
      hash[category] = (monthly_totals.sum / 3.0).floor
    end
  end
end
