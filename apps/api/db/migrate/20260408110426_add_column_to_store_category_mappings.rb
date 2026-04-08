class AddColumnToStoreCategoryMappings < ActiveRecord::Migration[8.1]
  def change
    add_column :store_category_mappings, :store_name, :string
    add_reference :store_category_mappings, :category, null: false, foreign_key: true
  end
end
