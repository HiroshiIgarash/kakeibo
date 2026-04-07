class CreateStoreCategoryMappings < ActiveRecord::Migration[8.1]
  def change
    create_table :store_category_mappings do |t|
      t.timestamps
    end
  end
end
