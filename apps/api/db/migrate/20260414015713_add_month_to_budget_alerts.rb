class AddMonthToBudgetAlerts < ActiveRecord::Migration[8.1]
  def change
    add_column :budget_alerts, :month, :date, null: false
    add_index :budget_alerts, [ :category_id, :month, :threshold ], unique: true
  end
end
