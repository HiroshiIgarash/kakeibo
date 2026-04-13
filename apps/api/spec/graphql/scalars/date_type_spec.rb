# frozen_string_literal: true

require "rails_helper"

RSpec.describe Scalars::DateType do
  describe ".coerce_input" do
    it "有効な日付文字列を Date オブジェクトに変換する" do
      result = described_class.coerce_input("2024-01-15", nil)
      expect(result).to eq(Date.new(2024, 1, 15))
    end

    it "無効な文字列は GraphQL::CoercionError を発生させる" do
      expect {
        described_class.coerce_input("not-a-date", nil)
      }.to raise_error(GraphQL::CoercionError)
    end
  end

  describe ".coerce_result" do
    it "Date オブジェクトを ISO8601 文字列に変換する" do
      result = described_class.coerce_result(Date.new(2024, 1, 15), nil)
      expect(result).to eq("2024-01-15")
    end
  end
end
