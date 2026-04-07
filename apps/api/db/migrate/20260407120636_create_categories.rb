class CreateCategories < ActiveRecord::Migration[8.1]
  def change
    create_table :categories do |t|
      t.string  :type,       null: false
      t.string  :name,       null: false
      t.string  :color
      t.integer :parent_id
      t.integer :sort_order, null: false, default: 0
      t.integer :transactions_count, null: false, default: 0

      t.timestamps
    end

    add_index :categories, :type
    add_index :categories, :parent_id
  end
end
