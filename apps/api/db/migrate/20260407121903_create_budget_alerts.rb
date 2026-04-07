class CreateBudgetAlerts < ActiveRecord::Migration[8.1]
  def change
    create_table :budget_alerts do |t|
      t.references :category,      null: false, foreign_key: true
      t.integer    :usage_percent, null: false
      t.integer    :threshold,     null: false

      t.timestamps
    end
  end
end
