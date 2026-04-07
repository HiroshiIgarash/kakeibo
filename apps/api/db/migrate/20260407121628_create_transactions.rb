class CreateTransactions < ActiveRecord::Migration[8.1]
  def change
    create_table :transactions do |t|
      t.integer    :amount,       null: false                                         
      t.string     :store_name,   null: false
      t.references :category,     null: true, foreign_key: true                       
      t.string     :memo                                          
      t.datetime   :purchased_at, null: false                                         
      t.string     :source,       null: false 

      t.timestamps
    end

    add_index :transactions, :purchased_at                    
    add_index :transactions, :source
  end
end
