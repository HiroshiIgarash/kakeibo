# frozen_string_literal: true

require "rails_helper"

RSpec.describe Dataloaders::RecordById do
  describe "#fetch" do
    let!(:category) { create(:category) }

    it "IDに対応するレコードを返す" do
      result = nil
      dl = GraphQL::Dataloader.new
      dl.run_isolated do
        result = dl.with(described_class, Category).load(category.id)
      end
      expect(result).to eq(category)
    end

    it "存在しないIDはnilを返す" do
      result = nil
      dl = GraphQL::Dataloader.new
      dl.run_isolated do
        result = dl.with(described_class, Category).load(0)
      end
      expect(result).to be_nil
    end

    it "複数IDをまとめて取得できる" do
      category2 = create(:category)
      results = []
      dl = GraphQL::Dataloader.new
      dl.run_isolated do
        source = dl.with(described_class, Category)
        p1 = source.load(category.id)
        p2 = source.load(category2.id)
        results = [ p1, p2 ]
      end
      expect(results).to eq([ category, category2 ])
    end
  end
end
