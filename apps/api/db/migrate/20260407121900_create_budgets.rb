class CreateBudgets < ActiveRecord::Migration[8.1]
  def change
    create_table :budgets do |t|
      t.references :category, null: false, foreign_key: true
      t.integer    :amount,   null: false
      t.date     :month,    null: false

      t.timestamps
    end

    add_index :budgets, [:category_id, :month], unique: true
  end
end
