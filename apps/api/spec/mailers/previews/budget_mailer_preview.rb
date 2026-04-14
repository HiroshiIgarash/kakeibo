# Preview all emails at http://localhost:3000/rails/mailers/budget_mailer_mailer
class BudgetMailerPreview < ActionMailer::Preview

  # Preview this email at http://localhost:3000/rails/mailers/budget_mailer_mailer/budget_exceeded
  def budget_exceeded
    BudgetMailer.budget_exceeded
  end

end
